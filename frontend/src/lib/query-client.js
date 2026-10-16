import { QueryClient } from "@tanstack/react-query";
export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000,
        refetchOnWindowFocus: false,
        retry: (count, error) => error?.status >= 500 && count < 1,
      },
      mutations: { retry: false },
    },
  });
