-- tryMarkerStop  (dev only, run with tools/bridge.mjs; CHANGES the open project)
--
-- Experiment: does an SWS action marker "!40667" (Transport: Stop, save all
-- recorded media) stop REAPER by itself, during playback and recording?
--
-- args:    { step = "start", mode = "play" | "record", at = marker time, from = start time }
--          { step = "cleanup" }  stop if running, delete the test marker
-- returns: what was done

local args = ...
local R = reaper
local NAME = "!40667"

local function delete_test_markers()
  local removed = 0
  for i = R.GetNumRegionsOrMarkers(0) - 1, 0, -1 do
    local m = R.GetRegionOrMarker(0, i, "")
    local _, name = R.GetSetRegionOrMarkerInfo_String(0, m, "P_NAME", "", false)
    if name == NAME and R.GetRegionOrMarkerInfo_Value(0, m, "B_ISREGION") == 0 then
      R.DeleteProjectMarker(0, math.floor(R.GetRegionOrMarkerInfo_Value(0, m, "I_NUMBER")), false)
      removed = removed + 1
    end
  end
  return removed
end

if args.step == "cleanup" then
  if R.GetPlayStateEx(0) & 4 ~= 0 then R.Main_OnCommand(40667, 0) elseif R.GetPlayStateEx(0) ~= 0 then R.OnStopButton() end
  return { removed = delete_test_markers(), state = R.GetPlayStateEx(0) }
end

delete_test_markers()
R.GetSetRepeatEx(0, 0)
R.GetSetProjectInfo(0, "PLAYBACK_STOP", 0, true)
R.GetSet_LoopTimeRange2(0, true, false, 0, 0, false)
R.GetSet_LoopTimeRange2(0, true, true, 0, 0, false)
local idx = R.AddProjectMarker2(0, false, args.at, 0, NAME, -1, 0)
R.SetEditCurPos2(0, args.from, false, false)
if args.mode == "record" then R.CSurf_OnRecord() else R.OnPlayButton() end
return { marker = idx, at = args.at, from = args.from, mode = args.mode, state = R.GetPlayStateEx(0) }
