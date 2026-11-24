import { TeamSettingsSection } from "@/components/settings/TeamSettingsSection"
import { ProfileSettingsSection } from "@/components/settings/ProfileSettingsSection"
import { SecuritySettingsSection } from "@/components/settings/SecuritySettingsSection"
import { NotificationsSettingsSection } from "@/components/settings/NotificationsSettingsSection"
import { WhiteLabelSettingsSection } from "@/components/settings/WhiteLabelSettingsSection"
import { ClientPortalSettingsSection } from "@/components/settings/ClientPortalSettingsSection"
import { ClientWorkspacesSettingsSection } from "@/components/settings/ClientWorkspacesSettingsSection"
import { ApiKeysSettingsSection } from "@/components/settings/ApiKeysSettingsSection"
import { WebhooksSettingsSection } from "@/components/settings/WebhooksSettingsSection"
import { AuditLogSettingsSection } from "@/components/settings/AuditLogSettingsSection"
import { AppearanceSettingsSection } from "@/components/settings/AppearanceSettingsSection"
import { AnnouncementsSettingsSection } from "@/components/settings/AnnouncementsSettingsSection"

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }> | { section: string }
}) {
  const resolvedParams = await params
  const section = resolvedParams?.section

  switch (section) {
    case "profile":
      return <ProfileSettingsSection />
    case "security":
      return <SecuritySettingsSection />
    case "notifications":
      return <NotificationsSettingsSection />
    case "team":
      return <TeamSettingsSection />
    case "white-label":
      return <WhiteLabelSettingsSection />
    case "client-portal":
      return <ClientPortalSettingsSection />
    case "workspaces":
      return <ClientWorkspacesSettingsSection />
    case "api-keys":
      return <ApiKeysSettingsSection />
    case "appearance":
      return <AppearanceSettingsSection />
    case "webhooks":
      return <WebhooksSettingsSection />
    case "announcements":
      return <AnnouncementsSettingsSection />
    case "audit-log":
      return <AuditLogSettingsSection />
    default:
      return <TeamSettingsSection />
  }
}
