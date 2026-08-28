import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "../components/layouts/DashboardLayout";
import { ProtectedRoute } from "../components/layouts/ProtectedRoute";

import { InboxPage } from "../pages/private/Inbox";
import { ContactsPage } from "../pages/private/Contacts";
import { SettingsPage } from "../pages/private/Settings";
import { TicketsPage } from "../pages/private/Tickets";
import { TicketDetailPage } from "../pages/private/TicketDetail";
import { UsersPage } from "../pages/private/UsersPage";
import { TeamsPage } from "../pages/private/TeamsPage";
import { LoginPage } from "../pages/public/Login";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/inbox" replace />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="tickets/:id" element={<TicketDetailPage />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/teams" element={<TeamsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
