import { SettingsPage } from '@/components/settings/settings-page';
import { requireUser } from '@/server/auth/require-user';
import { ProfileService } from '@/server/profile/service';

export default async function SettingsRoutePage() {
  const user = await requireUser();
  const settings = await new ProfileService().getSettings(user.id);
  return <SettingsPage settings={settings} />;
}
