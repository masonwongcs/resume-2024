import * as cheerio from 'cheerio';
import _ from 'lodash';

const COLOR_MAP: Record<number, string> = {
  0: '#ebedf0',
  1: '#9be9a8',
  2: '#40c463',
  3: '#30a14e',
  4: '#216e39'
};

interface YearLink {
  href: string;
  text: string;
}

interface ContributionRange {
  start: string | undefined;
  end: string | undefined;
}

interface ContributionDay {
  date: string;
  count: number;
  color: string;
  intensity: string | number;
}

interface YearlyData {
  year: string;
  total: number;
  range: ContributionRange;
  contributions: ContributionDay[] | Record<number, Record<number, Record<number, ContributionDay>>>;
}

async function fetchYears(username: string): Promise<YearLink[]> {
  const data = await fetch(`https://github.com/${username}?tab=contributions`, {
    headers: {
      'x-requested-with': 'XMLHttpRequest'
    }
  });
  const body = await data.text();
  const $ = cheerio.load(body);
  return $('.js-year-link.filter-item')
    .get()
    .map((a) => {
      const $a = $(a);
      const href = $a.attr('href');
      if (!href) throw new Error('Invalid href');

      const githubUrl = new URL(`https://github.com${href}`);
      githubUrl.searchParams.set('tab', 'contributions');
      const formattedHref = `${githubUrl.pathname}${githubUrl.search}`;

      return {
        href: formattedHref,
        text: $a.text().trim()
      };
    });
}

async function fetchDataForYear(url: string, year: string, format: 'nested' | 'flat'): Promise<YearlyData> {
  const data = await fetch(`https://github.com${url}`, {
    headers: {
      'x-requested-with': 'XMLHttpRequest'
    }
  });
  const $ = cheerio.load(await data.text());
  const $days = $('table.ContributionCalendar-grid td.ContributionCalendar-day');

  const contribText = $('.js-yearly-contributions h2')
    .text()
    .trim()
    .match(/^([0-9,]+)\s/);
  let contribCount = 0;
  if (contribText) {
    contribCount = parseInt(contribText[0].replace(/,/g, ''), 10);
  }

  const contributions = (() => {
    const parseDay = (day: any, index: number) => {
      const $day = $(day);
      const date =
        $day
          .attr('data-date')
          ?.split('-')
          .map((d: string) => parseInt(d, 10)) || [];
      const color = COLOR_MAP[parseInt($day.attr('data-level') || '0', 10)];
      const value: ContributionDay = {
        date: $day.attr('data-date') || '',
        count: index === 0 ? contribCount : 0,
        color,
        intensity: $day.attr('data-level') || 0
      };
      return { date, value };
    };

    if (format !== 'nested') {
      return $days.get().map((day: any, index: number) => parseDay(day, index).value);
    }

    return $days
      .get()
      .reduce<Record<number, Record<number, Record<number, ContributionDay>>>>((o: any, day: any, index: number) => {
        const { date, value } = parseDay(day, index);
        const [y, m, d] = date;
        if (!o[y]) o[y] = {};
        if (!o[y][m]) o[y][m] = {};
        o[y][m][d] = value;
        return o;
      }, {});
  })() as any;

  return {
    year,
    total: contribCount,
    range: {
      start: $days.first().attr('data-date'),
      end: $days.last().attr('data-date')
    },
    contributions
  };
}

export async function fetchDataForAllYears(username: string, format: 'nested' | 'flat') {
  const years = await fetchYears(username);
  const data = await Promise.all(years.map((year) => fetchDataForYear(year.href, year.text, format)));

  return {
    years: (() => {
      const obj: Record<string, YearlyData> = {};
      const arr = data.map((year) => {
        const { contributions, ...rest } = year;
        _.setWith(obj, [rest.year], rest, Object);
        return rest;
      });
      return format === 'nested' ? obj : arr;
    })(),
    contributions:
      format === 'nested'
        ? data.reduce((acc, curr) => _.merge(acc, curr.contributions), {})
        : data
            .reduce<ContributionDay[]>((list, curr) => [...list, ...(curr.contributions as ContributionDay[])], [])
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  };
}
