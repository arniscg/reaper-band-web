-- recordPractice
--
-- Practice Record: the same pre-flight idea as startLive minus the
-- mode-specific checks (all refusals before any change), then:
--   1. chosen players armed, others disarmed, player mutes and rate applied
--   2. time selection = the part, or the whole song plus tail
--   3. start = part start minus pre-roll bars (tempo map), never before the
--      song start. No pre-roll for a whole-song take or a part at the song
--      start: those start exactly at the start.
--   4. record; auto-punch records only inside the selection, REAPER stops at
--      its end
--   5. the scope is stored as the last take, for Play last and Retry
--
-- args:    { songId, partId (absent = whole song), prerollBars }
-- returns: { recording = true, start, range = { start, ["end"] }, fixed = [ text ] }
--
-- REAPER API: TimeMap2_timeToBeats, TimeMap2_beatsToTime, GetSet_LoopTimeRange2,
--             GetSetProjectInfo_String ("RECORD_PATH"), SetEditCurPos2, CSurf_OnRecord

local args = ...
local R = reaper
local U = B.call("util")

U.checkProject()
if U.mode() ~= "practice" then error("Not in Practice mode. Enter Practice in Setup first.", 0) end
local song = U.findSong(args.songId) or error("Song not found in the Songs lane", 0)
local part = nil
if args.partId then
  for _, p in ipairs(song.parts) do
    if p.id == args.partId then part = p end
  end
  if not part then error("Part not found in " .. song.name, 0) end
end
local opts = U.practice()
if #opts.players == 0 then error("No players chosen to record", 0) end
local settings = U.settings()
U.requireActions({ "recTimeSel", "preservePitch", "stopAtLoopEnd", "stopSave" })
U.checkDisk(settings)

local fixed = {}
U.stopIfPlaying()

U.applyBackingMutes("practice")
U.applyPracticeTracks(opts)
U.ensureToggle("preservePitch", true)
U.setRate(opts.rate)
U.ensureOn("recTimeSel")
R.GetSetRepeatEx(0, 0)
U.ensureToggle("stopAtLoopEnd", true)
U.fixAutomation(fixed)
U.setRecordPath("Recordings/Practice")

local range_start = part and part.start or song.start
local range_end = part and part["end"] or song["end"] + settings.tail
local start = range_start
local bars = math.floor(tonumber(args.prerollBars) or 0)
if part and part.start > song.start + 0.001 and bars > 0 then
  local beats, measures = R.TimeMap2_timeToBeats(0, part.start)
  start = R.TimeMap2_beatsToTime(0, beats, math.max(0, measures - bars))
  if start < song.start then start = song.start end
end

U.setRange(range_start, range_end)
R.SetEditCurPos2(0, start, true, false)
U.startTake({ kind = "practice", songId = song.id, partId = part and part.id or nil, start = start, stopAt = range_end }) -- before starting: sets REAPER's stop point
R.CSurf_OnRecord()

U.setJSON("lastTake", {
  songId = song.id,
  partId = part and part.id or nil,
  prerollBars = bars,
  rate = opts.rate,
  players = opts.players,
  start = start,
  rangeStart = range_start,
  rangeEnd = range_end,
})
U.changed()

return { recording = true, start = start, range = { start = range_start, ["end"] = range_end }, fixed = fixed }
