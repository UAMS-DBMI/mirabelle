import React, { useLayoutEffect, useState } from 'react';
import { getDicomDump } from '@/utilities';

import './DicomDump.css';

function HtmlRenderer({ htmlString }) {
  return (
    <div dangerouslySetInnerHTML={{ __html: htmlString }} />
  );
}


export default function DicomDump({ file_id }) {
  const [data, setData] = useState('Loading...');

  useLayoutEffect(() => {
    async function fetchData() {
      // This is a placeholder for any side effects or setup needed when the component mounts
      console.log(`DicomDump component mounted with file_id: ${file_id}`);
      const dump = await getDicomDump(file_id); // Assuming this function fetches or processes the DICOM dump
      console.log('DICOM Dump:', dump);
      setData(dump || 'No data available');
    }
    fetchData();
  }, [file_id]);

  return (
    <div id="dicom-dump">
      <h2>DicomDump component</h2>
      <p>File: {file_id}</p>
      <HtmlRenderer htmlString={data} />
    </div>
  );
}
