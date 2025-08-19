import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';

import MaskReviewIEC from '@/features/mask-review/MaskReviewIEC';
import MaterialButtonSet from '@/components/MaterialButtonSet';
import { setLoading } from '@/features/optionSlice';
import { resetOptions } from '@/features/optionSlice';

import './MaskReviewVR.css';

export default function MaskReviewVR({ vr, iec, onNext, onPrevious }) {

	return (
		<>
			{iec && (
				<MaskReviewIEC
					vr={vr}
					iec={iec}
					onNext={onNext}
					onPrevious={onPrevious}
				/>
			)}
		</>
	);
}
