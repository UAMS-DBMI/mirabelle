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
  preset: "CT-MIP",
  decimate: 0,
  persistent: true,
  loading: false,
};

// `?decimate=N` in the URL. Read here, when the store is created, so the very
// first exam load already uses it — applying it later from an effect would
// start a full-resolution load only to throw it away. From then on Redux is
// the source of truth and hooks/useDecimateInUrl mirrors it back to the URL.
export const DECIMATE_URL_PARAM = "decimate";

function readDecimateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = Number.parseInt(params.get(DECIMATE_URL_PARAM), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

const optionSlice = createSlice({
  name: "options",
  // Only the store's starting value comes from the URL. `initialState` itself
  // keeps 0, so a non-persistent reset still means "no decimation".
  initialState: { ...initialState, decimate: readDecimateFromUrl() },
  reducers: {
    setOption: (state, action) => {
      const { key, value } = action.payload;
      state[key] = value;
    },
    resetOptions: (state) => {
      Object.keys(state).forEach((key) => {
        if (key !== "function" && key !== "form" && key !== "persistent") {
          if (state.persistent && key === "decimate") {
          } else {
            state[key] = initialState[key];
          }
        }
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
