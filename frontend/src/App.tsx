import { Link, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { GuestRoute, ProtectedRoute } from "./components/layout/RouteGuards";
import { DiscoveryView } from "./pages/discovery/DiscoveryView";
import { AccountLinkPage } from "./pages/auth/AccountLinkPage";
import { CheckEmailPage } from "./pages/auth/CheckEmailPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { ChatPage } from "./pages/chat/ChatPage";
import { LandingPage } from "./pages/LandingPage";
import { MapPage } from "./pages/MapPage";
import { Icon } from "./components/ui/Icon";
import { NotificationsPage } from "./pages/NotificationsPage";
import { OnboardingPage } from "./pages/profile/OnboardingPage";
import { ProfilePage } from "./pages/profile/ProfilePage";
import { PublicProfilePage } from "./pages/profile/PublicProfilePage";
import { PeopleListPage } from "./pages/relationships/PeopleListPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignedInHeader } from "./components/layout/SessionActions";

function NotFoundPage() {
  return (
    <>
      <SignedInHeader />
      <div className="not-found container">
        <Icon name="compass" size={44} />
        <h1>That page wandered off.</h1>
        <p className="lead">Let's get you back to something interesting.</p>
        <Link to="/" className="btn btn--primary btn--lg">Go home</Link>
      </div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
      <Route path="/check-email" element={<CheckEmailPage />} />
      <Route path="/account/verify" element={<AccountLinkPage mode="verify" />} />
      <Route path="/account/reset" element={<AccountLinkPage mode="reset" />} />
      <Route path="/account/email" element={<AccountLinkPage mode="email" />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="discover" element={<DiscoveryView mode="suggestions" />} />
        <Route path="search" element={<DiscoveryView mode="search" />} />
        <Route path="map" element={<MapPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="profile/me" element={<ProfilePage />} />
        <Route path="profile/:id" element={<PublicProfilePage />} />
        <Route path="likes" element={<PeopleListPage mode="likes" />} />
        <Route path="visitors" element={<PeopleListPage mode="visitors" />} />
        <Route path="blocks" element={<PeopleListPage mode="blocks" />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:id" element={<ChatPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
