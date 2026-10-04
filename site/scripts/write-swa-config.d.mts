export interface SwaConfig {
  trailingSlash: 'always' | 'never' | 'auto';
  responseOverrides: Record<string, { rewrite: string }>;
  globalHeaders: Record<string, string>;
  mimeTypes: Record<string, string>;
}
export declare function cspFor(themeScript: string): string;
export declare function buildSwaConfig(themeScript: string): SwaConfig;
