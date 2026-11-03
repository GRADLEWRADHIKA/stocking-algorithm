/**
 * QuantDesk mobile — paper trading & algorithmic analysis on a SIMULATED Indian market.
 * No real money, no real exchange prices.
 */
import 'react-native-gesture-handler';
import React, {useEffect, useState} from 'react';
import {StyleSheet} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ApiError} from './src/api/client';
import {RootNavigator} from './src/navigation/RootNavigator';
import {setLogoutHook, useAuthStore} from './src/store/auth';
import {useThemeStore} from './src/store/theme';
import {useServerStore} from './src/store/server';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            return false;
          }
          return count < 2;
        },
      },
      mutations: {retry: false},
    },
  });
}

export function AppProviders({children, client}: {children: React.ReactNode; client: QueryClient}) {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function App(): React.JSX.Element {
  const [client] = useState(createQueryClient);

  useEffect(() => {
    setLogoutHook(() => client.clear());
    (async () => {
      await useThemeStore.getState().hydrate();
      // the saved server address must be applied before the first request
      await useServerStore.getState().hydrate();
      await useAuthStore.getState().bootstrap();
    })();
    return () => setLogoutHook(null);
  }, [client]);

  return (
    <AppProviders client={client}>
      <RootNavigator />
    </AppProviders>
  );
}

const styles = StyleSheet.create({flex: {flex: 1}});

export default App;
