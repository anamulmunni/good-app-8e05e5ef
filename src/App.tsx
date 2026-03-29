import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import AdminPanel from "./pages/AdminPanel";
import AddKeys from "./pages/AddKeys";
import Chat from "./pages/Chat";
import Feed from "./pages/Feed";
import Reels from "./pages/Reels";
import ShortReels from "./pages/ShortReels";
import UserProfile from "./pages/UserProfile";
import ChannelPage from "./pages/ChannelPage";
import WatchVideo from "./pages/WatchVideo";
import CallPage from "./pages/CallPage";
import IncomingCallHandler from "./components/IncomingCallHandler";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import { useOnlineHeartbeat } from "@/hooks/use-online";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

function AppInner() {
  useOnlineHeartbeat();
  return (
    <>
      <IncomingCallHandler />
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
        <Route path="/~oauth" element={<Login />} />
        <Route path="/~c" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
