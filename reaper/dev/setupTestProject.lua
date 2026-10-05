-- setupTestProject  (dev only, run with tools/bridge.mjs; WIPES the open project)
--
-- Turns the open project into a small Band Remote test project:
--   - deletes all tracks, regions, markers and Band Remote project data
--   - names ruler lane 0 "Songs" and lane 1 "Parts"
--   - tracks: Show backing [Show] (folder) > Drums rendered,
--             Drums MIDI [Practice], Bass [Live], Vocals [Live],
--             Guitar [Live], Vocal talk (untagged)
--   - 3 songs of 32 s (16 bars at 120 bpm), 8 s apart, each with four
--     8 s parts: Intro, Verse, Chorus, Outro
--   - marks it as the band project and saves it
--
-- args:    { confirm = "wipe-this-test-project" }  (refuses otherwise)
-- returns: { tracks, songs, file }

local args = ...
local R = reaper

if args.confirm ~= "wipe-this-test-project" then
  error('Refused: pass { "confirm": "wipe-this-test-project" }. This deletes everything in the open project.', 0)
end
local _, file = R.EnumProjects(-1)
if not file or file == "" then error("Save the project first", 0) end

R.Undo_BeginBlock()

for i = R.CountTracks(0) - 1, 0, -1 do R.DeleteTrack(R.GetTrack(0, i)) end

local guard = 0
while R.GetNumRegionsOrMarkers(0) > 0 and guard < 10000 do
  local m = R.GetRegionOrMarker(0, 0, "")
  local num = math.floor(R.GetRegionOrMarkerInfo_Value(0, m, "I_NUMBER"))
  local is_region = R.GetRegionOrMarkerInfo_Value(0, m, "B_ISREGION") ~= 0
  R.DeleteProjectMarker(0, num, is_region)
  guard = guard + 1
end

R.SetProjExtState(0, "BandRemote", "", "")

R.GetSetProjectInfo_String(0, "RULER_LANE_NAME:0", "Songs", true)
R.GetSetProjectInfo_String(0, "RULER_LANE_NAME:1", "Parts", true)

local TRACKS = {
  { "Show backing [Show]", 1 },
  { "Drums rendered", -1 },
  { "Drums MIDI [Practice]", 0 },
  { "Bass [Live]", 0 },
  { "Vocals [Live]", 0 },
  { "Guitar [Live]", 0 },
  { "Vocal talk", 0 },
}
for i, t in ipairs(TRACKS) do
  R.InsertTrackAtIndex(i - 1, true)
  local tr = R.GetTrack(0, i - 1)
  R.GetSetMediaTrackInfo_String(tr, "P_NAME", t[1], true)
  R.SetMediaTrackInfo_Value(tr, "I_FOLDERDEPTH", t[2])
end

local function add_region(name, s, e, lane)
  local num = R.AddProjectMarker2(0, true, s, e, name, -1, 0)
  for i = 0, R.GetNumRegionsOrMarkers(0) - 1 do
    local m = R.GetRegionOrMarker(0, i, "")
    if R.GetRegionOrMarkerInfo_Value(0, m, "B_ISREGION") ~= 0 and math.floor(R.GetRegionOrMarkerInfo_Value(0, m, "I_NUMBER")) == num then
      R.SetRegionOrMarkerInfo_Value(0, m, "I_LANENUMBER", lane)
      return
    end
  end
  error("could not find new region " .. name)
end

local SONGS = { "Test Song One", "Test Song Two", "Test Song Three" }
local PARTS = { "Intro", "Verse", "Chorus", "Outro" }
local t = 4
for _, name in ipairs(SONGS) do
  add_region(name, t, t + 32, 0)
  for j, part in ipairs(PARTS) do
    add_region(part, t + (j - 1) * 8, t + j * 8, 1)
  end
  t = t + 40
end

R.SetProjExtState(0, "BandRemote", "marker", "1")
R.Undo_EndBlock("Band Remote: set up test project", -1)
R.UpdateArrange()
R.Main_SaveProject(0, false)

return { tracks = #TRACKS, songs = #SONGS, file = file }
