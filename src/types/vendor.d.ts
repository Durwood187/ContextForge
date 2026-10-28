// Minimal typings for turndown + the GFM plugin (avoids extra @types deps).
declare module 'turndown' {
  namespace TurndownService {
    interface Options {
      headingStyle?: 'setext' | 'atx';
      hr?: string;
      bulletListMarker?: '-' | '+' | '*';
      codeBlockStyle?: 'indented' | 'fenced';
      fence?: '```' | '~~~';
      emDelimiter?: '_' | '*';
      strongDelimiter?: '__' | '**';
      linkStyle?: 'inlined' | 'referenced';
    }
    type Filter = string | string[] | ((node: HTMLElement, options: Options) => boolean);
    interface Rule {
      filter: Filter;
      replacement?: (content: string, node: HTMLElement, options: Options) => string;
    }
    type Plugin = (service: TurndownService) => void;
  }
  class TurndownService {
    constructor(options?: TurndownService.Options);
    addRule(key: string, rule: TurndownService.Rule): this;
    remove(filter: TurndownService.Filter): this;
    keep(filter: TurndownService.Filter): this;
    use(plugins: TurndownService.Plugin | TurndownService.Plugin[]): this;
    turndown(input: string | Node): string;
  }
  export = TurndownService;
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}
