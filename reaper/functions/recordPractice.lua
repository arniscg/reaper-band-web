-- recordPractice
--
-- Practice Record: the same pre-flight idea as startLive minus the
-- mode-specific checks (all refusals before any change), then:
--   1. chosen players armed, everyone else disarmed (they stay disarmed
--      afterwards); recorded tracks don't play their earlier takes along
--      ("monitor track media when recording" off); mutes left as they are;
--      rate applied
--   2. time selection = the part, a range of parts, or the whole song
--   3. start = part start minus pre-roll bars (tempo map), never before the
--      song start. No pre-roll for a whole-song take or a part at the song
--      start: those start exactly at the start.
--   4. record; auto-punch records only inside the selection, REAPER stops at
--      its end
--
-- args:    { songId, partId (absent = whole song), toPartId (absent = just that
--            part; else through the end of that part), prerollBars }
-- returns: { recording = true, start, range = { start, ["end"] }, fixed = [ text ] }
--
-- REAPER API: TimeMap2_timeToBeats, TimeMap2_beatsToTime (via util), GetSet_LoopTimeRange2,
--             GetSetProjectInfo_String ("RECORD_PATH"), SetEditCurPos2, CSurf_OnRecord

local args = ...
local R = reaper
local U = B.call("util")

U.checkProject()
if U.mode() ~= "practice" then error("Not in Practice mode. Enter Practice in Setup first.", 0) end
local song = U.findSong(args.songId) or error("Song not found in the Songs lane", 0)
local part = U.findPart(song, args.partId)
local to_part = part and U.findPart(song, args.toPartId) or nil
local opts = U.practice()
if #opts.players == 0 then error("No players chosen to record", 0) end
local settings = U.settings()
U.requireActions({ "recTimeSel", "preservePitch", "stopAtLoopEnd", "stopSave" })
U.checkDisk(settings)

local fixed = {}
U.stopIfPlaying()
U.unmuteMarkedTakes()

U.applyBackingMutes("practice")
U.armForRecording(opts.players)
U.ensureToggle("preservePitch", true)
U.setRate(opts.rate)
U.ensureOn("recTimeSel")
R.GetSetRepeatEx(0, 0)
U.ensureToggle("stopAtLoopEnd", true)
U.fixAutomation(fixed)
U.setRecordPath("Recordings/Practice")

local start, range_start, range_end = U.practiceScope(song, part, args.prerollBars, to_part)

U.setRange(range_start, range_end)
R.SetEditCurPos2(0, start, true, false)
U.startTake({ kind = "practice", songId = song.id, partId = part and part.id or nil, start = start, stopAt = range_end }) -- before starting: sets REAPER's stop point
R.CSurf_OnRecord()

return { recording = true, start = start, range = { start = range_start, ["end"] = range_end }, fixed = fixed }
