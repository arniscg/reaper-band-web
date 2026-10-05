-- loadSong
--
-- Queue the song and move the edit cursor to its start; REAPER applies the
-- automation there (the song's sound-check state) while stopped. Refused
-- while recording; plain playback is stopped first. The page shows "loaded"
-- when the transport is stopped with the cursor at the queued song's start.
--
-- args:    { id = song guid }
-- returns: { queued = guid, pos = seconds }
--
-- REAPER API: GetPlayState, OnStopButton, SetEditCurPos2

local args = ...
local R = reaper
local U = B.call("util")

U.refuseWhileRecording("Song selection")
local song = U.findSong(args.id) or error("Song not found in the Songs lane", 0)
U.stopIfPlaying()
U.set("queued", song.id)
R.SetEditCurPos2(0, song.start, true, false)
return { queued = song.id, pos = song.start }
