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
  // opacity — these two are the mask box drawn on top of it. 1 / true keep the
  // box at the appearance it had before these controls existed.
  maskOpacity: 1,
  maskVisible: true,
  preset: "CT-MIP",
  decimate: 0,
  persistent: true,
  loading: false,
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
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
  },
});

export const { setOption, resetOptions, setTitle, setLoading } =
  optionSlice.actions;
export default optionSlice.reducer;
