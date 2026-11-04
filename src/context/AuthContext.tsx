import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { insforge } from '../lib/insforge';
import { api } from '../lib/api';
import { aliasEmailToMobile, mobileToAliasEmail } from '../lib/phone';
import type { EmployerProfile, Profile, Role, WorkerProfile } from '../lib/types';
import {
  isNative,
  mobileSignIn,
  mobileOtpSignIn,
  mobileSignUp,
  mobileSignOut,
  clearTokens,
  loadTokens,
} from '../lib/mobileAuth';

interface AuthState {
  loading: boolean;
  userId: string | null;
  /** internal alias address — not shown to users */
  email: string | null;
  /** the 10-digit mobile number this account logs in with */
  mobile: string | null;
  profile: Profile | null;
  worker: WorkerProfile | null;
  employer: EmployerProfile | null;
  role: Role | null;
  needsOnboarding: boolean;
  refresh: () => Promise<void>;
  signIn: (mobile: string, password: string) => Promise<void>;
  signInOtp: (mobile: string, otp: string) => Promise<void>;
  signUp: (mobile: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [employer, setEmployer] = useState<EmployerProfile | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.myProfile();
      setProfile(res?.profile ?? null);
      setWorker(res?.worker ?? null);
      setEmployer(res?.employer ?? null);
    } catch {
      setProfile(null);
      setWorker(null);
      setEmployer(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (isNative()) {
      // Native: Capacitor Preferences se tokens/user load karo
      const { user, accessToken } = await loadTokens();
      const u = user as { id?: string; email?: string } | null;
      if (u && accessToken) {
        setUserId(u.id ?? null);
        setEmail(u.email ?? null);
        await loadProfile();
      } else {
        setUserId(null);
        setEmail(null);
        setProfile(null);
        setWorker(null);
        setEmployer(null);
      }
    } else {
      // Web: normal SDK cookie session
      const { data } = await insforge.auth.getCurrentUser();
      const u = data?.user ?? null;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? null);
      if (u) await loadProfile();
      else {
        setProfile(null);
        setWorker(null);
        setEmployer(null);
      }
    }
  }, [loadProfile]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(
    async (mobile: string, password: string) => {
      const alias = mobileToAliasEmail(mobile);

      if (isNative()) {
        // Native: REST mobile auth
        await mobileSignIn(alias, password);
        await refresh();
      } else {
        // Web: SDK cookie session
        const { error } = await insforge.auth.signInWithPassword({
          email: alias,
          password,
        });
        if (error) throw error;
        await refresh();
      }
    },
    [refresh],
  );

  const signInOtp = useCallback(
    async (mobile: string, otp: string) => {
      const alias = mobileToAliasEmail(mobile);
      if (isNative()) {
        await mobileOtpSignIn(alias, otp);
        await refresh();
      } else {
        // Web: the code row was stored by our otp_send function in the platform's
        // auth.email_otps table; verifyOtp validates it and creates the session
        // through the SDK's own token manager (correct cookie + refresh token).
        const { error } = await insforge.auth.verifyOtp({ email: alias, otp });
        if (error) throw error;
        await refresh();
      }
    },
    [refresh],
  );

  const signUp = useCallback(
    async (mobile: string, password: string, name: string) => {
      const alias = mobileToAliasEmail(mobile);

      if (isNative()) {
        // Native: REST mobile signup
        await mobileSignUp(alias, password);
        // Name update baad mein profile create ke time hoga (Onboarding)
        void name; // used in Onboarding create_my_profile call
        await refresh();
      } else {
        // Web: SDK
        const { error } = await insforge.auth.signUp({ email: alias, password, name });
        if (error) throw error;
        const cur = await insforge.auth.getCurrentUser();
        if (!cur.data?.user) {
          const { error: e2 } = await insforge.auth.signInWithPassword({ email: alias, password });
          if (e2) throw e2;
        }
        await refresh();
      }
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    if (isNative()) {
      await mobileSignOut();
    } else {
      await insforge.auth.signOut();
    }
    setUserId(null);
    setEmail(null);
    setProfile(null);
    setWorker(null);
    setEmployer(null);
    // Cleanup native tokens just in case
    if (isNative()) await clearTokens();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      userId,
      email,
      mobile: profile?.phone ?? aliasEmailToMobile(email) ?? null,
      profile,
      worker,
      employer,
      role: profile?.role ?? null,
      needsOnboarding: !!userId && !profile,
      refresh,
      signIn,
      signInOtp,
      signUp,
      signOut,
    }),
    [loading, userId, email, profile, worker, employer, refresh, signIn, signInOtp, signUp, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
