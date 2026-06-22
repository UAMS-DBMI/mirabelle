import { configureStore } from "@reduxjs/toolkit";
import counterReducer from "@/features/counterSlice";
import presentationReducer from "@/features/presentationSlice";
import maskingReducer from "@/features/maskingSlice";
import optionReducer from "@/features/optionSlice";

const store = configureStore({
  reducer: {
    counter: counterReducer,
    presentation: presentationReducer,
    masking: maskingReducer,
    options: optionReducer,
  },
});

export default store;
