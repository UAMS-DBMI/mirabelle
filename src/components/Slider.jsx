import React, { useState } from "react";

import "./Slider.css";

const Slider = ({ min = 0, max = 100, step = 1, initial = 0, onChange }) => {
  const [value, setValue] = useState(initial);

  const handleChange = (event) => {
    const newValue = Number(event.target.value);
    setValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="flex flex-col space-y-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      <span className="text-center text-gray-600">{value}</span>
    </div>
  );
};

export default Slider;
