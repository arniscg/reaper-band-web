-- play
--
-- Practice Play: play the selected song, part or range of parts, with the same scope as
-- Record (pre-roll, part or song end) at the current tempo.
-- Arming and track mutes stay as they are. Armed players play along live,
-- so their own earlier takes in the range are muted for this playback (and
-- unmuted by tick when it stops); disarmed players' takes play. REAPER stops
-- at the end (stop marker / PLAYBACK_STOP), backed up by tick.
--
-- args:    { songId, partId (absent = whole song), toPartId (absent = just that
--            part; else through the end of that part), prerollBars }
-- returns: { playing = true, start, range = { start, ["end"] } }
--
-- REAPER API: GetSet_LoopTimeRange2, SetEditCurPos2, OnPlayButton

local args = ...
local R = reaper
local U = B.call("util")

U.refuseWhileRecording("Play")
local song = U.findSong(args.songId) or error("Song not found in the Songs lane", 0)
local part = U.findPart(song, args.partId)
local to_part = part and U.findPart(song, args.toPartId) or nil
local start, range_start, range_end = U.practiceScope(song, part, args.prerollBars, to_part)

U.stopIfPlaying()
U.unmuteMarkedTakes() -- leftovers, if a previous playback wasn't cleaned up
U.muteTakesOfArmed(start, range_end)
R.GetSetRepeatEx(0, 0)
U.setRange(range_start, range_end)
R.SetEditCurPos2(0, start, true, false)
U.startTake({ kind = "play", songId = song.id, partId = part and part.id or nil, start = start, stopAt = range_end }) -- before starting: sets REAPER's stop point
R.OnPlayButton()

return { playing = true, start = start, range = { start = range_start, ["end"] = range_end } }
