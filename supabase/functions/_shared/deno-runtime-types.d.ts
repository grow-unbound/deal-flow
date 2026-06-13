declare module 'npm:@supabase/supabase-js@2' {
  export function createClient(...args: unknown[]): any;
}

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
