import React from 'react';

import { useState, useContext } from 'react';
import { useSelector } from 'react-redux';

import "./OperationsPanel.css";

function OperationsPanel({ onAction }) {
  const buttonConfig = useSelector(state => state.presentation.buttonConfig);

  return (
    <div id="operations-panel">
      {buttonConfig.masker.visibility.expand && (
        <button
          id="expand-selection"
          onClick={() => onAction("expand")} >
          Expand Selection
        </button>
      )}

      {buttonConfig.masker.visibility.clear && (
        <button
          id="clear-selection"
          onClick={() => onAction("clear")} >
          Clear Selection
        </button>
      )}

      {buttonConfig.masker.visibility.accept && (
        <button
          id="accept-selection"
          onClick={() => onAction("accept")} >
          Accept Selection
        </button>
      )}

      {buttonConfig.maskerReview.visibility.accepted && (
        <button
          id="accept-mask"
          onClick={() => onAction("accept mask")} >
          Accept Mask
        </button>
      )}
      {buttonConfig.maskerReview.visibility.rejected && (
        <button
          id="reject-mask"
          onClick={() => onAction("reject mask")} >
          Reject Mask
        </button>
      )}
      {buttonConfig.maskerReview.visibility.skip && (
        <button
          id="skip-mask"
          onClick={() => onAction("skip mask")} >
          Skip Mask
        </button>
      )}

      {buttonConfig.maskerReview.visibility.nonMaskable && (
        <button
          id="nonmaskable"
          onClick={() => onAction("nonmaskable mask")} >
          Non-Maskable
        </button>
      )}

      {buttonConfig.visualReview.visibility.good && (
        <button
          id="mark-good"
          onClick={() => onAction("good")} >
          Good
        </button>
      )}

      {buttonConfig.visualReview.visibility.bad && (
        <button
          id="mark-bad"
          onClick={() => onAction("bad")} >
          Bad
        </button>
      )}

      {buttonConfig.visualReview.visibility.blank && (
        <button
          id="mark-blank"
          onClick={() => onAction("blank")} >
          Blank
        </button>
      )}

      {buttonConfig.visualReview.visibility.scout && (
        <button
          id="mark-scout"
          onClick={() => onAction("scout")} >
          Scout
        </button>
      )}

      {buttonConfig.visualReview.visibility.other && (
        <button
          id="mark-other"
          onClick={() => onAction("other")} >
          Other
        </button>
      )}

      {buttonConfig.visualReview.visibility.flag && (
        <button
          id="flag-for-masking"
          onClick={() => onAction("flag")} >
          Flag for Masking
        </button>
      )}
    </div>
  )
}

export default OperationsPanel
