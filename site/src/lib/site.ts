export const SITE_NAME = 'Agentic Field Guide';
export const HERO_HEADING = 'Agentic AI For The Field.';
export const BANNER_ALT =
  'Agentic AI workloads architecture: AI agent, orchestrator, and task execution with feedback and human-in-the-loop review';
export const SITE_DESCRIPTION =
  'Hands-on labs for running AI agents on Kubernetes: kagent, agentgateway, MCP, Agent Substrate, and more.';

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "7 labs, 9 coming soon", "1 lab", or "Coming soon" when nothing is written yet. */
export function labCountLabel({ labs, soon }: { labs: number; soon: number }, withSoon = true): string {
  if (labs === 0) return 'Coming soon';
  return `${plural(labs, 'lab')}${withSoon && soon ? `, ${soon} coming soon` : ''}`;
}
