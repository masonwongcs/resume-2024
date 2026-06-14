import { aiStickers, backendStickers, devopsSticker, frontEndStickers, softSkillSticker } from '@/fixture/Info.fixture';

export const INFO = [
  {
    title: 'Frontend',
    skills: [
      'HTML',
      'CSS',
      'JavaScript',
      'TypeScript',
      'React.js',
      'Next.js',
      'Vue.js',
      'Nuxt.js',
      'Tailwind CSS',
      'SCSS/Sass'
    ],
    stickers: frontEndStickers
  },
  {
    title: 'Backend',
    skills: ['Node.js', 'Express.js', 'Bun.js', 'Deno.js', 'RESTful APIs', 'GraphQL', 'SQL', 'PostgreSQL', 'FastAPI'],
    stickers: backendStickers
  },
  {
    title: 'AI',
    skills: [
      'Generative AI',
      'Image Generation',
      'Video Generation',
      'Prompt Engineering',
      'AI-Assisted Development',
      'Cursor',
      'Claude Code',
      'LLM Integration',
      'MCP',
      'Agentic Workflows'
    ],
    stickers: aiStickers
  },
  {
    title: 'DevOps',
    skills: [
      'CI/CD (Jenkins, GitHub Actions)',
      'Docker',
      'Kubernetes',
      'Cloud Platform',
      'AWS',
      'Google Cloud Platform'
    ],
    stickers: devopsSticker
  },
  {
    title: 'Soft Skills',
    skills: [
      'Team Collaboration',
      'Agile Methodologies',
      'Scrum',
      'Problem-solving',
      'Mentorship and Leadership',
      'Project Management'
    ],
    stickers: softSkillSticker
  }
];
