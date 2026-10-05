-- startLive
--
-- Live mode Start: pre-flight checks, then record the song.
--
-- Pre-flight. All refusals come first, so a refused Start changes nothing:
--   refuse  project marker missing, project never saved, not in Live mode
--   refuse  already recording
--   refuse  song not found in the Songs lane
--   refuse  number of [Live] tracks differs from settings.liveCount
--   refuse  a needed REAPER action can't be found
--   refuse  free disk on the record path below settings.minDiskGB
-- Then fixed silently:
--   all [Live] tracks armed, unmuted, record input on, monitoring on
--   master playrate 1.0; [Show] unmuted, [Practice] muted
--   record mode normal, repeat off
--   "stop playback at end of loop if repeat is disabled" on
--   no track or global override in a writing automation mode
--   record path Recordings/Live
-- Then: time selection and loop points = song start .. song end + tail;
-- cursor to song start; record. tick handles the song end and the watchdog.
--
-- args:    { id = song guid }
-- returns: { recording = true, armed = [ track index ], fixed = [ text ] }
--
-- REAPER API: GetSet_LoopTimeRange2, SetMediaTrackInfo_Value, CSurf_OnPlayRateChange,
--             GetSetRepeatEx, SetTrackAutomationMode, GetFreeDiskSpaceForRecordPath,
--             SetEditCurPos2, CSurf_OnRecord

local args = ...
local R = reaper
local U = B.call("util")

U.checkProject()
if U.mode() ~= "live" then error("Not in Live mode. Enter Live in Setup first.", 0) end
local song = U.findSong(args.id) or error("Song not found in the Songs lane", 0)
local settings = U.settings()
local tracks = U.tracks()
local live = U.withTag(tracks, "live")
if #live ~= settings.liveCount then
  error(string.format("Expected %d [Live] tracks, found %d. Check the track names or the setting in Setup.", settings.liveCount, #live), 0)
end
U.requireActions({ "recNormal", "stopAtLoopEnd", "stopSave" })
U.checkDisk(settings)

local fixed = {}
U.stopIfPlaying()

local armed = {}
for _, t in ipairs(live) do
  U.arm(t.tr, true)
  U.mute(t.tr, false)
  armed[#armed + 1] = t.index
end
U.setRate(1)
U.applyBackingMutes("live")
U.ensureOn("recNormal")
R.GetSetRepeatEx(0, 0)
U.ensureToggle("stopAtLoopEnd", true)
U.fixAutomation(fixed)
U.setRecordPath("Recordings/Live")

local stop_at = song["end"] + settings.tail
U.setRange(song.start, stop_at)
R.SetEditCurPos2(0, song.start, true, false)
U.startTake({ kind = "live", songId = song.id, start = song.start, stopAt = stop_at }) -- before starting: sets REAPER's stop point
R.CSurf_OnRecord()

return { recording = true, armed = armed, fixed = fixed }
