import React, { useState, useEffect } from 'react';
import MaterialButtonSet from '@/components/MaterialButtonSet';
import NiftiReviewFile from '@/features/nifti-review/NiftiReviewFile';
import { useDispatch } from 'react-redux';
import { setLoading, resetOptions } from '@/features/optionSlice';
import { useHotkeys } from 'react-hotkeys-hook';

import './NiftiReviewVR.css';

export default function NiftiReviewVR({ vr, files }) {
	const [file, setFile] = useState();
	const [offset, setOffset] = useState(null);
	const [error, setError] = useState(null);
	const dispatch = useDispatch();

	useEffect(() => {
		if (Array.isArray(files) && files.length) {
			setOffset(0);
			setFile(files[0]);
		} else {
			setError("This VR contains no files, or does not exist!");
		}
	}, [files]);

	const handleNext = () => {
		dispatch(resetOptions());
		let currentOffset = 0;
		if (offset != null) {
			currentOffset = offset + 1;
		}
		console.log("setting to", currentOffset);
		dispatch(setLoading(true));
		setFile(files[currentOffset]);
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
		setFile(files[currentOffset]);
		setOffset(currentOffset);
	};

	useHotkeys('tab', handleNext);
	useHotkeys('right', handleNext);
	useHotkeys('left', handlePrevious);

	return (
		<>
			{file && (
				<NiftiReviewFile
					vr={vr}
					file={file}
					onNext={handleNext}
					onPrevious={handlePrevious}
				/>
			)}
			{error && (
				<div className="error-message">
					{error}
				</div>
			)}
		</>
	);
}
