import React from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  decrement,
  increment,
  incrementByAmount,
} from "../features/counterSlice";

import MaterialButtonSet from "./MaterialButtonSet";

import "./Counter.css";

export function Counter() {
  const count = useSelector((state) => state.counter.value);
  const dispatch = useDispatch();

  const buttonConfig = [
    {
      name: "Increment",
      icon: "arrow_upward",
      action: () => dispatch(increment()),
    },
    {
      name: "Big Increment",
      icon: "keyboard_double_arrow_up",
      action: () => dispatch(incrementByAmount(35)),
    },
    {
      name: "Decrement",
      icon: "arrow_downward",
      action: () => dispatch(decrement()),
    },
  ];

  return (
    <div>
      <div>
        <span>{count}</span>
        <MaterialButtonSet buttonConfig={buttonConfig} />
      </div>
    </div>
  );
}

export default Counter;
