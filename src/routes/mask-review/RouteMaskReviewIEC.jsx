import React, { useEffect } from 'react';
import { useLoaderData } from 'react-router-dom';
import { resetOptions } from '@/features/optionSlice';

import { Context } from '@/components/Context';
import useConfigState from '@/hooks/useConfigState';
import { getDetails } from '@/masking.js';
import { getFiles, getIECInfo } from '@/utilities';
import { TASK_CONFIGS } from '@/config/config';

import { useDispatch, useSelector } from 'react-redux'
import { setMaskerReviewConfig, reset } from '@/features/presentationSlice'
import MaskReviewIEC from '@/features/mask-review/MaskReviewIEC';

import './RouteMaskReviewIEC.css';

export async function loader({ params }) {

  //TODO this shouldn't be here?
  const details = await getDetails(params.iec);
  return { details, iec: params.iec };
}

export default function RouteMaskReviewIEC() {

  const dispatch = useDispatch();
  const { details, iec } = useLoaderData();

  useEffect(() => {
    dispatch(resetOptions());
    dispatch(reset());
    dispatch(setMaskerReviewConfig());
  }, []);

  return (
    <MaskReviewIEC iec={iec} />
  );
}
