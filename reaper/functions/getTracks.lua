-- getTracks
--
-- Tracks carrying a bracketed tag: [Live], [Show] or [Practice]. Whole tags
-- only, case-insensitive ("[live]" and "[ Live ]" count, "Live" or "[Lively]"
-- don't). [Live] is on input tracks (one track = one player). [Show] and
-- [Practice] may be on any track, folder or not; only the tagged track itself
-- is ever muted/unmuted.
--
-- args:    { }
-- returns: { tracks = [ { guid, index (1-based), name (full), label (name
--                         without tags), tags = ["live"|"show"|"practice"],
--                         folder = bool } ] }
--          Untagged tracks are not listed.
--
-- REAPER API: CountTracks, GetTrack, GetTrackGUID,
--             GetSetMediaTrackInfo_String (P_NAME), GetMediaTrackInfo_Value (I_FOLDERDEPTH)

local R = reaper
local KNOWN = { live = true, show = true, practice = true }

local tracks = {}
for i = 0, R.CountTracks(0) - 1 do
  local tr = R.GetTrack(0, i)
  local _, name = R.GetSetMediaTrackInfo_String(tr, "P_NAME", "", false)
  local tags = {}
  for tag in name:gmatch("%[([^%]]*)%]") do
    tag = tag:match("^%s*(.-)%s*$"):lower()
    if KNOWN[tag] then tags[#tags + 1] = tag end
  end
  if #tags > 0 then
    local label = name:gsub("%s*%[[^%]]*%]", ""):match("^%s*(.-)%s*$")
    if label == "" then label = "Track " .. (i + 1) end
    tracks[#tracks + 1] = {
      guid = R.GetTrackGUID(tr),
      index = i + 1,
      name = name,
      label = label,
      tags = tags,
      folder = R.GetMediaTrackInfo_Value(tr, "I_FOLDERDEPTH") == 1,
    }
  end
end

return { tracks = tracks }
