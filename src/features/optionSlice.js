import { createSlice } from '@reduxjs/toolkit';
import { Enums } from '@/features/presentationSlice';

const initialState = {
  left: false,
  right: false,
  reset: false,
  view: Enums.ViewOptions.VOLUME,
  function: Enums.FunctionOptions.MASK,
  form: Enums.FormOptions.CYLINDER,
  leftClick: Enums.LeftClickOptions.SELECTION,
  rightClick: Enums.RightClickOptions.ZOOM,
  opacity: 0.3,
  preset: 'CT-MIP',
  loading: false,
};

const optionSlice = createSlice({
  name: 'options',
  initialState,
  reducers: {
    setOption: (state, action) => {
      const { key, value } = action.payload;
      state[key] = value;
    },
    resetOptions: (state) => {
      Object.keys(state).forEach(key => {
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

export const { setOption, resetOptions, setTitle, setLoading } = optionSlice.actions;
export default optionSlice.reducer;
