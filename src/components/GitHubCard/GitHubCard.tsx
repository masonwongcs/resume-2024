'use client';

import './GitHubCard.scss';

import React, { useEffect, useState } from 'react';

interface ContributionDay {
  date: string;
  count: number;
  color: string;
  intensity: string;
}

interface MonthData {
  [key: string]: ContributionDay;
}

interface YearData {
  [key: string]: MonthData;
}

interface ApiResponse {
  data: {
    contributions: {
      [key: number]: YearData;
    };
  };
}

const GitHubCard: React.FC = () => {
  const [contributionData, setContributionData] = useState<YearData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContributions = async () => {
      try {
        const response = await fetch('/api/v1/github');
        const {
          data: { contributions: contributionsData }
        } = (await response.json()) as ApiResponse;

        if (contributionsData) {
          setContributionData(contributionsData[2024]);
        }
      } catch (err) {
        setError('Failed to fetch contribution data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchContributions();
  }, []);

  const generateWeeksData = (data: YearData) => {
    const weeks: ContributionDay[][] = Array(53)
      .fill(null)
      .map(() => Array(7).fill(null));
    let currentWeek = 0;
    let currentDay = 0;

    // Iterate through each month
    Object.keys(data)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach((month) => {
        const monthData = data[month];

        // Iterate through each day in the month
        Object.keys(monthData)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .forEach((day) => {
            const dayData = monthData[day];
            const date = new Date(dayData.date);

            if (currentDay === 7) {
              currentWeek++;
              currentDay = 0;
            }

            weeks[currentWeek][currentDay] = dayData;
            currentDay++;
          });
      });

    return weeks;
  };

  if (isLoading) {
    return <div className="githubCard githubCard--loading">Loading contribution data...</div>;
  }

  if (error) {
    return <div className="githubCard githubCard--error">{error}</div>;
  }

  if (!contributionData) {
    return <div className="githubCard githubCard--empty">No contribution data available</div>;
  }

  const weeksData = generateWeeksData(contributionData);

  return (
    <div className="githubCard">
      <div className="githubCard__graph">
        {weeksData.map((week, weekIndex) => (
          <div key={weekIndex} className="githubCard__week">
            {week.map((day, dayIndex) => {
              const defaultDay = {
                color: 'rgba(255,255,255,0.3)',
                count: 0,
                date: '',
                intensity: '0'
              };

              const dayData = day || defaultDay;

              return (
                <div
                  key={`${weekIndex}-${dayIndex}`}
                  className="githubCard__day"
                  style={{ backgroundColor: dayData.intensity === '0' ? defaultDay.color : dayData.color }}
                  title={dayData.date ? `${dayData.date}: ${dayData.count} contributions` : 'No contributions'}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export { GitHubCard };
