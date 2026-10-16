-- probeItems  (dev only, run with tools/bridge.mjs; read-only)
--
-- For each [Live] track: armed, "monitor track media when recording", and
-- how many items it has / are muted / are marked as muted by Play.
--
-- args:    { }
-- returns: { [track name] = { armed, monItems, items, muted, marked } }

local R = reaper
local out = {}
for i = 0, R.CountTracks(0) - 1 do
  local tr = R.GetTrack(0, i)
  local _, name = R.GetSetMediaTrackInfo_String(tr, "P_NAME", "", false)
  if name:lower():find("[live]", 1, true) then
    local items, muted, marked = 0, 0, 0
    for j = 0, R.CountTrackMediaItems(tr) - 1 do
      local item = R.GetTrackMediaItem(tr, j)
      items = items + 1
      if R.GetMediaItemInfo_Value(item, "B_MUTE") ~= 0 then muted = muted + 1 end
      local _, m = R.GetSetMediaItemInfo_String(item, "P_EXT:BandRemote_takeMuted", "", false)
      if m == "1" then marked = marked + 1 end
    end
    out[name] = { armed = R.GetMediaTrackInfo_Value(tr, "I_RECARM"), monItems = R.GetMediaTrackInfo_Value(tr, "I_RECMONITEMS"), items = items, muted = muted, marked = marked }
  end
end
return out
