-- addReference  (dev only, run with tools/bridge.mjs)
--
-- Adds a muted "Original [Reference]" track at the end of the project, unless
-- a [Reference] track already exists.
--
-- args:    { }
-- returns: { index (1-based), created = bool }

local R = reaper
for i = 0, R.CountTracks(0) - 1 do
  local _, name = R.GetSetMediaTrackInfo_String(R.GetTrack(0, i), "P_NAME", "", false)
  if name:lower():find("[reference]", 1, true) then return { index = i + 1, created = false } end
end
local n = R.CountTracks(0)
R.InsertTrackAtIndex(n, true)
local tr = R.GetTrack(0, n)
R.GetSetMediaTrackInfo_String(tr, "P_NAME", "Original [Reference]", true)
R.SetMediaTrackInfo_Value(tr, "B_MUTE", 1)
R.TrackList_AdjustWindows(false)
return { index = n + 1, created = true }
