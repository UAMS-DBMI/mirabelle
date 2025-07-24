import React, { useState, useEffect } from 'react';
import MaterialButtonSet from '@/components/MaterialButtonSet';
import DicomReviewIEC from '@/features/dicom-review/DicomReviewIEC';
import { useDispatch } from 'react-redux';
import { resetOptions, setLoading } from '@/features/optionSlice';
import { useHotkeys } from 'react-hotkeys-hook';

import './DicomReviewVR.css';

export default function DicomReviewVR({ vr, iecs }) {
	const [iec, setIec] = useState(0);
	const [offset, setOffset] = useState(null);
	const dispatch = useDispatch();

	// as soon as we get an array of iecs, show the first one
	useEffect(() => {
		if (Array.isArray(iecs) && iecs.length) {
			setOffset(0);
			setIec(iecs[0]);
		}
	}, [iecs]);

	const handleNext = () => {
		dispatch(resetOptions());
		let currentOffset = 0;
		if (offset != null) {
			currentOffset = offset + 1;
		}
		console.log("setting to", currentOffset);
		dispatch(setLoading(true));
		setIec(iecs[currentOffset]);
		setOffset(currentOffset);
	};

	const handlePrevious = () => {
		dispatch(resetOptions());
		let currentOffset = 0;
		if (offset != null) {
			currentOffset = offset - 1;
		}
		console.log("setting to", currentOffset);
		dispatch(setLoading(true));
		setIec(iecs[currentOffset]);
		setOffset(currentOffset);
	};

	useHotkeys('tab', handleNext);
	useHotkeys('right', handleNext);
	useHotkeys('left', handlePrevious);

	return (
		<>
			{iec && (
				<DicomReviewIEC
					vr={vr}
					iec={iec}
					onNext={handleNext}
					onPrevious={handlePrevious}
				/>
			)}
		</>
	);
}
