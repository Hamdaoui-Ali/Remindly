import { SettingsPage } from '@/components/settings/settings-page';
import { SettingsService } from '@/server/settings/service';

export default async function SettingsRoutePage() {
  const settings = await new SettingsService().getSettings();
  return <SettingsPage settings={settings} />;
}
