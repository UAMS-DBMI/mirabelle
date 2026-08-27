import { createSlice } from "@reduxjs/toolkit";
import { Enums } from "@/features/presentationSlice";

const initialState = {
  left: false,
  right: false,
  reset: false,
  view: Enums.ViewOptions.VOLUME,
  function: Enums.FunctionOptions.BLACKOUT,
  form: Enums.FormOptions.CUBOID,
  noise: 0,
  fill: 3,
  leftClick: Enums.LeftClickOptions.SELECTION,
  rightClick: Enums.RightClickOptions.ZOOM,
  opacity: 0.3,
  // Selection-box overlay controls. `opacity` above is the 3D volume's scalar
  // opacity — these two are the mask box drawn on top of it. Half opacity is
  // the useful starting point: the glass reads clearly as a solid region while
  // the anatomy inside it stays legible, which is the state a curator checks a
  // selection in. Full opacity is a deliberate "show me what the mask does"
  // move, not something to have to undo on every exam.
  maskOpacity: 0.5,
  maskVisible: true,
  // The PREVIOUS mask's box — the geometry this exam was already masked with,
  // read back from the API. Shown by default, because "what was masked here
  // before?" is context the curator wants before drawing rather than after,
  // and an exam that has one is the only exam this appears on at all. Faint,
  // though: it is a reference sitting behind the work, not the work, and at
  // this end of the slider it reads as a hollow glass outline that doesn't
  // compete with the selection being drawn on top of it.
  prevMaskOpacity: 0.2,
  prevMaskVisible: true,
  // Whether this exam HAS a previous mask to show. Set by the mask viewer once
  // the stored parameters are resolved against the loaded volume. The control
  // itself is always on the panel — this only decides whether it is live, so
  // an exam with nothing to show says so instead of the row vanishing.
  prevMaskAvailable: false,
  preset: "CT-MIP",
  decimate: 0,
  persistent: true,
  loading: false,
  // Compact "what am I looking at" line shown beside the header title (e.g.
  // "1117932 · CT · AXIAL LUNG"). Set by the exam routes when details load.
  titleDetail: null,
};

// Options navigation must NOT reset:
//   - the masking function/form the curator picked, which carry across the
//     queue by design;
//   - `persistent`, the flag that pins the decimate count;
//   - the mask-box appearance, which is remembered per exam instead (see
//     lib/maskViewPrefs). Resetting it here corrupted that memory: the mask
//     route resets options and THEN navigates, so if the new exam id arrives
//     even one render later, there is a render still showing the old exam
//     with the opacity already snapped back to 1 — and the per-exam saver,
//     which cannot tell that apart from the curator moving the slider,
//     recorded 100% over the value that exam actually had.
const PRESERVED_ON_RESET = new Set([
  "function",
  "form",
  "persistent",
  "maskOpacity",
  "maskVisible",
  "prevMaskOpacity",
  "prevMaskVisible",
  // Owned by the mask route, which recomputes it on every exam load (false
  // while loading, then whatever the new exam has). resetOptions must leave it
  // alone: MaskVR resets options BEFORE asking the route to navigate, and at
  // the end of the queue that navigation never happens — resetting here then
  // killed the control for an exam that stayed on screen, with nothing left to
  // recompute it.
  "prevMaskAvailable",
]);

const optionSlice = createSlice({
  name: "options",
  initialState,
  reducers: {
    setOption: (state, action) => {
      const { key, value } = action.payload;
      state[key] = value;
    },
    resetOptions: (state) => {
      Object.keys(state).forEach((key) => {
        if (PRESERVED_ON_RESET.has(key)) return;
        // `persistent` means the curator pinned the decimate count, so
        // navigation must not clear it.
        if (state.persistent && key === "decimate") return;
        state[key] = initialState[key];
      });
    },
    setTitle: (state, action) => {
      state.title = action.payload;
    },
    setTitleDetail: (state, action) => {
      state.titleDetail = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
  },
});

export const { setOption, resetOptions, setTitle, setTitleDetail, setLoading } =
  optionSlice.actions;
export default optionSlice.reducer;
