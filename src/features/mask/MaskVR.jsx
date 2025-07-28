import React, { useState, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useDispatch } from 'react-redux';
import { setLoading } from '@/features/optionSlice';
import MaterialButtonSet from '@/components/MaterialButtonSet';
import MaskIEC from '@/features/mask/MaskIEC';
import { resetOptions } from '@/features/optionSlice';

import "./MaskVR.css";

export default function MaskVR({ vr, iec, onNext, onPrevious }) {
  useHotkeys("tab", onNext);
  useHotkeys("right", onNext);
  useHotkeys("left", onPrevious);

  return (
    <>
      {iec && (
        <MaskIEC
          vr={vr}
          iec={iec}
          onNext={onNext}
          onPrevious={onPrevious}
        />
      )}
    </>
  );
}
