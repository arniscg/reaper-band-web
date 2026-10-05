-- util
--
-- Shared helpers for the other functions; the page never calls it.
-- Usage inside a function:  local U = B.call("util")
--
-- returns: a table of helper functions (encodes to {} if called directly)

local R = reaper
local U = {}

U.EXT = "BandRemote" -- project ext state section

---------------------------------------------------------------------------
-- Project data (project ext state)
---------------------------------------------------------------------------

function U.get(key)
  local _, value = R.GetProjExtState(0, U.EXT, key)
  return value or ""
end

function U.set(key, value)
  R.SetProjExtState(0, U.EXT, key, value or "")
end

function U.getJSON(key, default)
  local s = U.get(key)
  if s == "" then return default end
  local ok, value = pcall(B.json.decode, s)
  if ok and value ~= nil then return value end
  return default
end

function U.setJSON(key, value)
  U.set(key, B.json.encode(value))
end

-- Tell the page to reload its data (setlist, settings, mode...).
function U.changed()
  B.state.data = (B.state.data or 0) + 1
end

-- A message for the page: kind "event" (info) or "watchdog" (warning).
function U.notice(kind, message)
  B.state.seq = (B.state.seq or 0) + 1
  B.state[kind] = { seq = B.state.seq, message = message }
end

function U.mode()
  return U.get("mode") == "practice" and "practice" or "live"
end

function U.projectFile()
  local _, fn = R.EnumProjects(-1)
  return fn or ""
end

-- Save, but never into a Save As dialog (that would block REAPER).
function U.save()
  if U.projectFile() ~= "" and not U.isRecording() then R.Main_SaveProject(0, false) end
end

---------------------------------------------------------------------------
-- Transport
---------------------------------------------------------------------------

function U.isRecording() return R.GetPlayStateEx(0) & 4 ~= 0 end
function U.isPlaying() return R.GetPlayStateEx(0) & 1 ~= 0 end

function U.refuseWhileRecording(what)
  if U.isRecording() then error(what .. " is locked while recording", 0) end
end

function U.stopIfPlaying()
  if R.GetPlayStateEx(0) & 3 ~= 0 then R.OnStopButton() end
end

---------------------------------------------------------------------------
-- Songs, tracks, settings
---------------------------------------------------------------------------

function U.findSong(id)
  for _, s in ipairs(B.call("getSongMap").songs) do
    if s.id == id then return s end
  end
  return nil
end

-- getTracks result plus the MediaTrack handle of each track (as .tr)
function U.tracks()
  local list = B.call("getTracks").tracks
  for _, t in ipairs(list) do t.tr = R.GetTrack(0, t.index - 1) end
  return list
end

function U.withTag(list, tag)
  local out = {}
  for _, t in ipairs(list) do
    for _, tg in ipairs(t.tags) do
      if tg == tag then out[#out + 1] = t; break end
    end
  end
  return out
end

function U.trackByGuid(guid)
  for i = 0, R.CountTracks(0) - 1 do
    local tr = R.GetTrack(0, i)
    if R.GetTrackGUID(tr) == guid then return tr end
  end
  return nil
end

function U.contains(list, value)
  for _, v in ipairs(list or {}) do
    if v == value then return true end
  end
  return false
end

-- Arm (with record input and monitoring) or disarm a [Live] track.
function U.arm(tr, on)
  R.SetMediaTrackInfo_Value(tr, "I_RECARM", on and 1 or 0)
  if on then
    if R.GetMediaTrackInfo_Value(tr, "I_RECMODE") == 2 then R.SetMediaTrackInfo_Value(tr, "I_RECMODE", 0) end -- "none" -> input
    if R.GetMediaTrackInfo_Value(tr, "I_RECMON") == 0 then R.SetMediaTrackInfo_Value(tr, "I_RECMON", 1) end
  end
end

function U.mute(tr, on)
  R.SetMediaTrackInfo_Value(tr, "B_MUTE", on and 1 or 0)
end

-- [Show] unmuted / [Practice] muted in Live, the other way round in Practice.
function U.applyBackingMutes(mode)
  local tracks = U.tracks()
  for _, t in ipairs(U.withTag(tracks, "show")) do U.mute(t.tr, mode == "practice") end
  for _, t in ipairs(U.withTag(tracks, "practice")) do U.mute(t.tr, mode ~= "practice") end
end

-- Practice: chosen players armed, the others disarmed; player mutes applied.
function U.applyPracticeTracks(opts)
  for _, t in ipairs(U.withTag(U.tracks(), "live")) do
    U.arm(t.tr, U.contains(opts.players, t.guid))
    U.mute(t.tr, U.contains(opts.mutes, t.guid))
  end
end

function U.setRate(rate)
  if math.abs(R.Master_GetPlayRate(0) - rate) > 0.0001 then R.CSurf_OnPlayRateChange(rate) end
end

function U.setRecordPath(path)
  R.GetSetProjectInfo_String(0, "RECORD_PATH", path, true)
end

function U.settings() return B.call("getSettings") end
function U.practice() return B.call("getPracticeOptions") end

---------------------------------------------------------------------------
-- REAPER actions, found by name (ids are verified, or searched if unknown)
---------------------------------------------------------------------------

U.ACTIONS = {
  stopSave = { id = 40667, words = { "stop", "save all recorded media" }, label = "Transport: Stop (save all recorded media)" },
  recNormal = { id = 40252, words = { "record mode", "normal" }, label = "Record: Set record mode to normal" },
  recTimeSel = { id = 40076, words = { "record mode", "time selection", "auto-punch" }, label = "Record: Set record mode to time selection auto-punch" },
  stopAtLoopEnd = { words = { "stop playback at end of loop" }, label = "Transport: Toggle stop playback at end of loop if repeat is disabled" },
  preservePitch = { id = 40671, words = { "preserve pitch", "playrate" }, label = "Transport: Toggle preserve pitch in audio items when changing master playrate" },
  -- SWS (optional): extension actions get ids above REAPER's own, assigned at startup
  swsMarkerActions = { words = { "sws: toggle marker actions enable" }, label = "SWS: Toggle marker actions enable",
                       optional = true, ranges = { { 50000, 65535 } } },
}

local section = R.SectionFromUniqueID and R.SectionFromUniqueID(0) or nil

local function action_name(id)
  local ok, name = pcall(R.kbd_getTextFromCmd, id, section)
  if ok and type(name) == "string" and name ~= "" then return name:lower() end
  return nil
end

local function matches(name, words)
  if not name then return false end
  for _, w in ipairs(words) do
    if not name:find(w, 1, true) then return false end
  end
  return true
end

-- Where REAPER's own actions live; searching all 65535 ids blocks REAPER
-- for seconds, these ranges take a fraction of that.
local SEARCH_RANGES = { { 1000, 2999 }, { 40000, 43999 } }
local FOUND_SECTION = "BandRemote_actions" -- ids found by name, kept across restarts

-- Command id of a known action, or nil if REAPER has none by that name.
function U.action(key)
  B.state.actions = B.state.actions or {}
  local cached = B.state.actions[key]
  if cached ~= nil then return cached or nil end
  local def = U.ACTIONS[key]
  local found = false
  if def.id then
    local name = action_name(def.id)
    if name == nil and action_name(1007) == nil then
      found = def.id -- names can't be read in this REAPER: trust the known id
    elseif matches(name, def.words) then
      found = def.id
    end
  end
  if not found then
    local saved = tonumber(R.GetExtState(FOUND_SECTION, key))
    if saved and matches(action_name(saved), def.words) then found = saved end
  end
  if not found then
    for _, range in ipairs(def.ranges or SEARCH_RANGES) do
      for id = range[1], range[2] do
        if matches(action_name(id), def.words) then found = id; break end
      end
      if found then break end
    end
    if found then R.SetExtState(FOUND_SECTION, key, tostring(found), true) end
  end
  B.state.actions[key] = found
  return found or nil
end

function U.missingActions()
  local out = {}
  for key, def in pairs(U.ACTIONS) do
    if not def.optional and not U.action(key) then out[#out + 1] = def.label end
  end
  table.sort(out)
  return out
end

local function need(key)
  return U.action(key) or error("REAPER action not found: " .. U.ACTIONS[key].label, 0)
end

-- Pre-flight: refuse before changing anything if an action is missing.
function U.requireActions(keys)
  for _, key in ipairs(keys) do need(key) end
end

-- Make a toggle action's state on/off; refuse if REAPER doesn't take it.
function U.ensureToggle(key, on)
  local id = need(key)
  local want = on and 1 or 0
  if R.GetToggleCommandStateEx(0, id) ~= want then R.Main_OnCommand(id, 0) end
  if R.GetToggleCommandStateEx(0, id) ~= want then
    error("Could not set: " .. U.ACTIONS[key].label, 0)
  end
end

-- Run a "set" action (record mode) unless it is already the active one.
function U.ensureOn(key)
  local id = need(key)
  if R.GetToggleCommandStateEx(0, id) ~= 1 then R.Main_OnCommand(id, 0) end
end

---------------------------------------------------------------------------
-- Pre-flight pieces shared by startLive and recordPractice
---------------------------------------------------------------------------

function U.checkProject()
  if U.get("marker") ~= "1" then
    error("This is not the band project. Open it in REAPER, or mark this one in Setup.", 0)
  end
  if U.projectFile() == "" then error("The project has never been saved. Save it in REAPER first.", 0) end
  if U.isRecording() then error("Already recording", 0) end
end

-- No track or the global override may write automation during a take.
function U.fixAutomation(fixed)
  local count = 0
  local function fix(tr)
    if R.GetTrackAutomationMode(tr) >= 2 then
      R.SetTrackAutomationMode(tr, 1)
      count = count + 1
    end
  end
  fix(R.GetMasterTrack(0))
  for i = 0, R.CountTracks(0) - 1 do fix(R.GetTrack(0, i)) end
  if count > 0 then fixed[#fixed + 1] = count .. " track(s) set to automation Read" end
  if R.GetGlobalAutomationOverride() >= 2 then
    R.SetGlobalAutomationOverride(-1)
    fixed[#fixed + 1] = "global automation override cleared"
  end
end

function U.checkDisk(settings)
  local free = R.GetFreeDiskSpaceForRecordPath(0, 0)
  if free >= 0 and free < settings.minDiskGB * 1024 then
    error(string.format("Low disk space: %.1f GB free on the record drive, minimum %g GB", free / 1024, settings.minDiskGB), 0)
  end
end

-- Time selection and loop points: REAPER stops at the loop end when repeat
-- is off and "stop playback at end of loop" is on.
function U.setRange(s, e)
  R.GetSet_LoopTimeRange2(0, true, false, s, e, false)
  R.GetSet_LoopTimeRange2(0, true, true, s, e, false)
end

---------------------------------------------------------------------------
-- Stop marker: an SWS action marker "!40667" at the end of a take makes
-- REAPER itself run "Stop (save all recorded media)" there, during playback
-- and recording (verified on REAPER 7.68 + SWS 2.14), so a take ends even if
-- the bridge is gone. Its GUID is kept in the project so a marker left
-- behind by a crash is removed at the next start. Optional: without SWS the
-- bridge stops takes itself.
---------------------------------------------------------------------------

-- nil if the stop marker can be used, else why not (for the diagnostics).
function U.stopMarkerProblem()
  if not R.CF_GetSWSVersion then return "SWS extension not installed" end
  if not U.action("swsMarkerActions") then return "SWS action not found: " .. U.ACTIONS.swsMarkerActions.label end
  return nil
end

function U.removeStopMarker()
  local guid = U.get("stopMarker")
  if guid == "" then return end
  local m = R.GetRegionOrMarker(0, -1, guid)
  if m and R.GetRegionOrMarkerInfo_Value(0, m, "B_ISREGION") == 0 then
    R.DeleteProjectMarker(0, math.floor(R.GetRegionOrMarkerInfo_Value(0, m, "I_NUMBER")), false)
  end
  U.set("stopMarker", nil)
end

-- Place the stop marker at time t. Returns true, or false and the reason.
function U.placeStopMarker(t)
  U.removeStopMarker()
  local problem = U.stopMarkerProblem()
  if problem then return false, problem end
  local toggle = U.action("swsMarkerActions")
  if R.GetToggleCommandStateEx(0, toggle) ~= 1 then R.Main_OnCommand(toggle, 0) end
  if R.GetToggleCommandStateEx(0, toggle) ~= 1 then return false, "could not enable SWS marker actions" end
  local stop_id = U.action("stopSave") or 40667
  local num = R.AddProjectMarker2(0, false, t, 0, "!" .. stop_id, -1, 0)
  for i = 0, R.GetNumRegionsOrMarkers(0) - 1 do
    local m = R.GetRegionOrMarker(0, i, "")
    if R.GetRegionOrMarkerInfo_Value(0, m, "B_ISREGION") == 0 and math.floor(R.GetRegionOrMarkerInfo_Value(0, m, "I_NUMBER")) == num then
      local _, guid = R.GetSetRegionOrMarkerInfo_String(0, m, "GUID", "", false)
      U.set("stopMarker", guid)
      return true
    end
  end
  return false, "could not place the stop marker"
end

-- The take the bridge is about to start, watched by tick (song end,
-- watchdog). Call it just before starting the transport: it also sets
-- REAPER's own stop points at the end (the SWS stop marker, and the project
-- setting PLAYBACK_STOP, which REAPER honours for playback), so REAPER can
-- stop by itself even if the bridge is gone. tick undoes both afterwards.
function U.startTake(take)
  take.created = R.time_precise()
  take.deadline = take.created + (take.stopAt - take.start) / math.max(0.1, R.Master_GetPlayRate(0)) + 5
  take.prevPlaybackStop = R.GetSetProjectInfo(0, "PLAYBACK_STOP", 0, false)
  R.GetSetProjectInfo(0, "PLAYBACK_STOP", take.stopAt, true)
  take.stopMarker, take.stopMarkerProblem = U.placeStopMarker(take.stopAt)
  B.state.active = take
end

-- Undo what startTake set up (called by tick when the take is over).
function U.endTake(take)
  R.GetSetProjectInfo(0, "PLAYBACK_STOP", take.prevPlaybackStop or 0, true)
  U.removeStopMarker()
end

-- Undo values remembered in a take's restore list once it stops.
function U.restore(list)
  for _, r in ipairs(list or {}) do
    local tr = U.trackByGuid(r.guid)
    if tr then R.SetMediaTrackInfo_Value(tr, r.param, r.value) end
  end
end

return U
