-- status  (run by the bridge loop every defer tick)
--
-- Small table published as status.app in every poll; read five times a
-- second, so it stays small and cheap. Data that needs a track scan
-- (practice options) is recomputed only when the project changes.
--
-- returns: { marker    = bool,
--            mode      = "live" | "practice",
--            queued    = song guid (absent if none),
--            rate      = master playrate,
--            active    = { kind = "live"|"practice"|"play", songId, partId } (absent if none),
--            practice  = { players = [guid], mutes = [guid] },
--            lastTake  = { songId, partId, prerollBars, rate, players, ... } (absent if none),
--            watchdog  = { seq, message } (absent if none),
--            event     = { seq, message } (absent if none),
--            counters  = { project, changes, data } }
--                        (the page reloads its data when a counter changes)
--
-- REAPER API: EnumProjects, GetProjectStateChangeCount, Master_GetPlayRate

local R = reaper
local S = B.state
local U = B.call("util")

local proj = R.EnumProjects(-1)
local project = tostring(proj)
local changes = R.GetProjectStateChangeCount(proj)
local key = project .. ":" .. changes .. ":" .. (S.data or 0)
if S.statusKey ~= key then
  S.statusKey = key
  local opts = U.practice()
  S.statusCache = {
    practice = { players = opts.players, mutes = opts.mutes },
    lastTake = U.getJSON("lastTake", nil),
  }
end

local a = S.active
local queued = U.get("queued")

return {
  marker = U.get("marker") == "1",
  mode = U.mode(),
  queued = queued ~= "" and queued or nil,
  rate = R.Master_GetPlayRate(proj),
  active = a and { kind = a.kind, songId = a.songId, partId = a.partId } or nil,
  practice = S.statusCache.practice,
  lastTake = S.statusCache.lastTake,
  watchdog = S.watchdog,
  event = S.event,
  counters = { project = project, changes = changes, data = S.data or 0 },
}
