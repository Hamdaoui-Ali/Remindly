-- Enforce the one-owner settings model at the database boundary.
ALTER TABLE "settings"
  ADD CONSTRAINT "settings_singleton_id_check" CHECK ("id" = 'singleton');
