import React, {useEffect, useMemo} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {createNavigationContainerRef, DarkTheme, DefaultTheme, NavigationContainer, type Theme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useAuthStore} from '../store/auth';
import {usePostLogin} from '../store/postLogin';
import {usePalette} from '../theme';
import {Txt} from '../components/Txt';
import {Logo} from '../components/Logo';
import {ToastHost} from '../components/Toast';
import {useMarketStream} from '../hooks/useLiveQuotes';
import {TabBar} from './TabBar';
import type {RootStackParamList, TabParamList} from './types';

import {WelcomeScreen} from '../screens/WelcomeScreen';
import {LoginScreen} from '../screens/auth/LoginScreen';
import {RegisterScreen} from '../screens/auth/RegisterScreen';
import {ForgotPasswordScreen} from '../screens/auth/ForgotPasswordScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {MarketsScreen} from '../screens/MarketsScreen';
import {WatchlistScreen} from '../screens/WatchlistScreen';
import {PortfolioScreen} from '../screens/PortfolioScreen';
import {ProfileScreen} from '../screens/ProfileScreen';
import {StockDetailScreen} from '../screens/StockDetailScreen';
import {ExplorerScreen} from '../screens/ExplorerScreen';
import {SignalsScreen} from '../screens/SignalsScreen';
import {SignalDetailScreen} from '../screens/SignalDetailScreen';
import {StrategyBuilderScreen} from '../screens/StrategyBuilderScreen';
import {BacktestingScreen} from '../screens/BacktestingScreen';
import {BacktestResultScreen} from '../screens/BacktestResultScreen';
import {PaperTradingScreen} from '../screens/PaperTradingScreen';
import {AssistantScreen} from '../screens/AssistantScreen';
import {OrderTicketScreen} from '../screens/OrderTicketScreen';
import {NotificationsScreen} from '../screens/NotificationsScreen';
import {AlertsScreen} from '../screens/AlertsScreen';
import {AdminScreen} from '../screens/AdminScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;

function Tabs() {
  return (
    <Tab.Navigator tabBar={renderTabBar} screenOptions={{headerShown: false}}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Markets" component={MarketsScreen} />
      <Tab.Screen name="Watchlist" component={WatchlistScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function Splash() {
  const p = usePalette();
  return (
    <View testID="splash" style={[styles.splash, {backgroundColor: p.ground}]}>
      <Logo size={40} />
      <Txt variant="h2">QuantDesk</Txt>
      <Txt variant="caption" tone="muted">
        Paper trading · simulated market
      </Txt>
      <ActivityIndicator color={p.muted} style={styles.spinner} />
    </View>
  );
}

/**
 * After login, honour the `next` target picked on Welcome/Login (web /login?next=/backtesting?symbol=…):
 * the tabs mount first, then the target screen is pushed on top so Back returns to Home.
 */
function PostLoginRedirect() {
  const target = usePostLogin(s => s.target);
  useEffect(() => {
    if (!target) {
      return;
    }
    let tries = 0;
    const go = () => {
      if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name === 'Login') {
        if (tries++ < 20) {
          timer = setTimeout(go, 50);
        }
        return;
      }
      usePostLogin.getState().set(null);
      if (target.route === 'Backtesting') {
        navigationRef.navigate('Backtesting', {symbol: target.symbol});
      } else {
        navigationRef.navigate(target.route);
      }
    };
    let timer = setTimeout(go, 0);
    return () => clearTimeout(timer);
  }, [target]);
  return null;
}

/** Live feed + notifications while signed in (web: useMarketStream in the app layout). */
function LiveFeed() {
  useMarketStream();
  return null;
}

export function RootNavigator() {
  const status = useAuthStore(s => s.status);
  const isAdmin = useAuthStore(s => s.user?.role === 'ADMIN');
  const p = usePalette();

  const navTheme: Theme = useMemo(() => {
    const base = p.mode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {...base.colors, primary: p.accent, background: p.ground, card: p.surface, text: p.ink, border: p.line, notification: p.down},
    };
  }, [p]);

  if (status === 'loading') {
    return <Splash />;
  }

  return (
    <View style={styles.flex}>
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        {status === 'authenticated' ? (
          <>
            <LiveFeed />
            <PostLoginRedirect />
          </>
        ) : null}
        <Stack.Navigator screenOptions={{headerShown: false, animation: 'slide_from_right', contentStyle: {backgroundColor: p.ground}}}>
          {status === 'authenticated' ? (
            <>
              <Stack.Screen name="Tabs" component={Tabs} />
              <Stack.Screen name="StockDetail" component={StockDetailScreen} />
              <Stack.Screen name="Explorer" component={ExplorerScreen} />
              <Stack.Screen name="Signals" component={SignalsScreen} />
              <Stack.Screen name="SignalDetail" component={SignalDetailScreen} />
              <Stack.Screen name="StrategyBuilder" component={StrategyBuilderScreen} />
              <Stack.Screen name="Backtesting" component={BacktestingScreen} />
              <Stack.Screen name="BacktestResult" component={BacktestResultScreen} />
              <Stack.Screen name="PaperTrading" component={PaperTradingScreen} />
              <Stack.Screen name="Assistant" component={AssistantScreen} />
              <Stack.Screen name="OrderTicket" component={OrderTicketScreen} options={{animation: 'slide_from_bottom'}} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="Alerts" component={AlertsScreen} />
              {isAdmin ? <Stack.Screen name="Admin" component={AdminScreen} /> : null}
            </>
          ) : (
            <>
              <Stack.Screen name="Welcome" component={WelcomeScreen} options={{animationTypeForReplace: 'pop'}} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  splash: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8},
  spinner: {marginTop: 16},
});
