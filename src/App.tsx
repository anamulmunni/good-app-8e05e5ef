import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import IncomingCallHandler from "./components/IncomingCallHandler";
import FloatingDashboardButton from "./components/FloatingDashboardButton";
import { useOnlineHeartbeat } from "@/hooks/use-online";

// Retry wrapper for lazy imports to handle transient network failures
function lazyRetry(factory: () => Promise<any>, retries = 3): ReturnType<typeof lazy> {
  return lazy(() =>
    factory().catch((err) => {
      if (retries > 0) {
        return new Promise<void>((resolve) => setTimeout(resolve, 500)).then(() =>
          lazyRetry(factory, retries - 1) as any
        );
      }
      // Force reload as last resort for stale chunk errors
      window.location.reload();
      throw err;
    })
  );
}

// Lazy load heavy pages with retry
const Register = lazyRetry(() => import("./pages/Register"));
const VerifyEmail = lazyRetry(() => import("./pages/VerifyEmail"));
const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const Profile = lazyRetry(() => import("./pages/Profile"));
const AdminPanel = lazyRetry(() => import("./pages/AdminPanel"));
const AddKeys = lazyRetry(() => import("./pages/AddKeys"));
const Chat = lazyRetry(() => import("./pages/Chat"));
const Feed = lazyRetry(() => import("./pages/Feed"));
const Reels = lazyRetry(() => import("./pages/Reels"));
const ShortReels = lazyRetry(() => import("./pages/ShortReels"));
const UserProfile = lazyRetry(() => import("./pages/UserProfile"));
const ChannelPage = lazyRetry(() => import("./pages/ChannelPage"));
const WatchVideo = lazyRetry(() => import("./pages/WatchVideo"));
const CallPage = lazyRetry(() => import("./pages/CallPage"));
const Install = lazyRetry(() => import("./pages/Install"));
const ResetPassword = lazyRetry(() => import("./pages/ResetPassword"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        const isTransient =
          message.includes("timeout") ||
          message.includes("failed to fetch") ||
          message.includes("network") ||
          message.includes("connection");
        return isTransient ? failureCount < 4 : failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppInner() {
  useOnlineHeartbeat();
  return (
    <>
      <IncomingCallHandler />
      <FloatingDashboardButton />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/index" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/add-keys" element={<AddKeys />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/reels" element={<Reels />} />
          <Route path="/short-reels" element={<ShortReels />} />
          <Route path="/user/:userId" element={<UserProfile />} />
          <Route path="/channel/:userId" element={<ChannelPage />} />
          <Route path="/watch/:postId" element={<WatchVideo />} />
          <Route path="/call/:userId" element={<CallPage />} />
          <Route path="/install" element={<Install />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/~oauth" element={<Login />} />
          <Route path="/~c" element={<Login />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
