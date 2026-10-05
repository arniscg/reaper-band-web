-- playLast
--
-- Replay the last take: turn off input monitoring on the tracks that were
-- recorded, play from the take's start through its range, and let tick
-- restore monitoring when it stops. Player mutes stay as they are, so a
-- player can hear only their own take. The newest recording is the active
-- take, so it is what plays.
--
-- args:    { }
-- returns: { playing = true, start, range = { start, ["end"] } }
--
-- REAPER API: SetMediaTrackInfo_Value (I_RECMON), GetSet_LoopTimeRange2,
--             SetEditCurPos2, OnPlayButton

local R = reaper
local U = B.call("util")

U.refuseWhileRecording("Play last")
local last = U.getJSON("lastTake", nil) or error("No previous take to play", 0)
if not U.findSong(last.songId) then error("The last take's song no longer exists", 0) end
U.stopIfPlaying()

local restore = {}
for _, guid in ipairs(last.players or {}) do
  local tr = U.trackByGuid(guid)
  if tr then
    restore[#restore + 1] = { guid = guid, param = "I_RECMON", value = R.GetMediaTrackInfo_Value(tr, "I_RECMON") }
    R.SetMediaTrackInfo_Value(tr, "I_RECMON", 0)
  end
end

R.GetSetRepeatEx(0, 0)
U.setRange(last.rangeStart, last.rangeEnd)
R.SetEditCurPos2(0, last.start, true, false)
U.startTake({ kind = "play", songId = last.songId, partId = last.partId, start = last.start, stopAt = last.rangeEnd, restore = restore }) -- before starting: sets REAPER's stop point
R.OnPlayButton()

return { playing = true, start = last.start, range = { start = last.rangeStart, ["end"] = last.rangeEnd } }
