import { createSlice } from "@reduxjs/toolkit";

const maskingSlice = createSlice({
  name: "masking",
  initialState: {
    function: "mask",
    form: "cylinder",
  },
  reducers: {
    setFunction: (state, action) => {
      state.function = action.payload;
    },
    setForm: (state, action) => {
      state.form = action.payload;
    },
  },
});

export const { setFunction, setForm } = maskingSlice.actions;

export default maskingSlice.reducer;
