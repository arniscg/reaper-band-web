-- setSettings
--
-- Update some or all settings (same fields as getSettings) and save the
-- project. Values outside their range are clamped.
--
-- args:    { tail?, prerollDefault?, liveCount?, minDiskGB? }
-- returns: the full settings table, as getSettings
--
-- REAPER API: SetProjExtState, Main_SaveProject

local args = ...
local U = B.call("util")

local RANGES = {
  tail = { 0, 10 },
  prerollDefault = { 0, 4 },
  liveCount = { 0, 64 },
  minDiskGB = { 0, 10000 },
}

local current = U.settings()
for key, range in pairs(RANGES) do
  local v = args[key]
  if type(v) == "number" then current[key] = math.min(range[2], math.max(range[1], v)) end
end

U.setJSON("settings", current)
U.save()
U.changed()
return current
