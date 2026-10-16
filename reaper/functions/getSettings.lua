-- getSettings
--
-- Band settings stored in the project, with defaults for anything missing.
--
-- args:    { }
-- returns: { prerollDefault = bars (default 2),
--            liveCount      = expected number of [Live] tracks (default: the
--                             number found now, until it is set in Setup),
--            minDiskGB      = minimum free space on the record drive (default 5) }
--
-- REAPER API: GetProjExtState

local U = B.call("util")

local stored = U.getJSON("settings", {})
local function num(key, default)
  local v = stored[key]
  if type(v) == "number" then return v end
  return default
end

local live_count = stored.liveCount
if type(live_count) ~= "number" then live_count = #U.withTag(B.call("getTracks").tracks, "live") end

return {
  prerollDefault = num("prerollDefault", 2),
  liveCount = live_count,
  minDiskGB = num("minDiskGB", 5),
}
