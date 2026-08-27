# Mirabelle Source (src) Folder Structure

Complete file structure of the `/src` directory as of February 17, 2026.

## Root Level Files

```
src/
├── debug.js                  # Debug utilities
├── error-page.css           # Error page styling
├── error-page.jsx           # Error page component
├── index.css                # Global styles
├── index.html               # Main HTML template
├── index.js                 # Application entry point
├── masking.js               # Masking functionality
├── masking.test.js          # Masking tests
├── store.js                 # Redux store configuration
├── utilities.js             # Utility functions
└── visualreview.js          # Visual review functionality
```

## assets/

Logo and icon assets:

```
assets/
├── mirabelle-logo-dark.svg
├── mirabelle-logo-light.png
├── mirabelle-logo-light.svg
├── mirabelle-logo.png
├── mirabelle-logo.svg
├── quince-small-logo.svg
└── resize-button.svg
```

## components/

Reusable React components with associated styles:

```
components/
├── AppLayout.css
├── AppLayout.jsx                    # Main application layout
├── CacheStatus.jsx                  # Header image-cache usage indicator
├── Context.js                       # React context definitions
├── Counter.css
├── Counter.jsx                      # Counter component
├── DicomDump.css
├── DicomDump.jsx                    # DICOM data dump display
├── EnableCornerstone.css
├── EnableCornerstone.jsx            # Cornerstone.js initialization
├── ErrorBoundary.css
├── ErrorBoundary.jsx                # Error boundary wrapper
├── ErrorPanel.css
├── ErrorPanel.jsx                   # Error display panel
├── FilterPanel.css
├── FilterPanel.jsx                  # Filtering controls
├── Header.css
├── Header.jsx                       # Application header
├── LabelingPanel.css
├── LabelingPanel.jsx                # Image labeling interface
├── LoadingOverlay.css
├── LoadingOverlay.jsx               # Full-screen loading overlay
├── LoadingSpinner.css
├── LoadingSpinner.jsx               # Loading spinner component
├── MaterialButtonSet.css
├── MaterialButtonSet.jsx            # Material design button group
├── MaterialIcon.css
├── MaterialIcon.jsx                 # Material design icons
├── MaybeVolumeViewport3d.jsx        # Conditional 3D viewport
├── NavigationPanel.css
├── NavigationPanel.jsx              # Navigation controls
├── OperationsPanel.css
├── OperationsPanel.jsx              # Operations control panel
├── RouteLayout.css
├── RouteLayout.jsx                  # Route layout wrapper
├── RouteTests.css
├── RouteTests.jsx                   # Testing routes
├── Slider.css
├── Slider.jsx                       # Slider control component
├── StackViewport.css
├── StackViewport.jsx                # 2D stack viewport
├── TestError.jsx                    # Error testing component
├── ViewerResizer.css
├── ViewerResizer.jsx                # Viewport resizing controls
├── VolumeViewport.css
├── VolumeViewport.jsx               # Volume rendering viewport
├── VolumeViewport3d.css
└── VolumeViewport3d.jsx             # 3D volume viewport
```

## config/

Configuration files:

```
config/
└── config.js                        # Current configuration
```

## features/

Feature modules organized by functionality:

```
features/
├── counterSlice.js                  # Redux counter state slice
├── maskingSlice.js                  # Redux masking state slice
├── optionSlice.js                   # Redux options state slice
├── presentationSlice.js             # Redux presentation state slice
│
├── details/
│   ├── DetailsPanel.css
│   ├── DetailsPanel.jsx             # Image details panel
│   └── index.js                     # Module exports
│
├── dicom-review/
│   ├── DicomReviewIEC.css
│   ├── DicomReviewIEC.jsx           # DICOM review (IEC view)
│   ├── DicomReviewVR.css
│   └── DicomReviewVR.jsx            # DICOM review (Volume Rendering)
│
├── mask/
│   ├── MaskIEC.css
│   ├── MaskIEC.jsx                  # Masking (IEC view)
│   ├── MaskVR.css
│   └── MaskVR.jsx                   # Masking (Volume Rendering)
│
├── mask-review/
│   ├── MaskReviewIEC.css
│   ├── MaskReviewIEC.jsx            # Mask review (IEC view)
│   ├── MaskReviewVR.css
│   └── MaskReviewVR.jsx             # Mask review (Volume Rendering)
│
├── nifti-review/
│   ├── NiftiReviewFile.css
│   ├── NiftiReviewFile.jsx          # NIfTI file review
│   ├── NiftiReviewVR.css
│   └── NiftiReviewVR.jsx            # NIfTI review (Volume Rendering)
│
├── seg/
│   ├── SegPanel.css
│   ├── SegPanel.jsx                 # Segmentation panel
│   └── index.js                     # Module exports
│
├── stack-view/
│   ├── StackView.css
│   ├── StackView.jsx                # Stack viewing functionality
│   └── index.js                     # Module exports
│
├── tools/
│   ├── ToolsPanel.css
│   ├── ToolsPanel.jsx               # Tools panel UI
│   ├── index.js                     # Module exports
│   ├── toolsConfig.js               # Tools configuration
│   └── toolsManager.js              # Tools management logic
│
└── volume-view/
    ├── VolumeView.css
    ├── VolumeView.jsx               # Volume viewing functionality
    └── index.js                     # Module exports
```

## hooks/

Custom React hooks:

```
hooks/
├── useConfigState.js                # Configuration state hook
└── useRendererResize.js             # Renderer resize handling hook
```

## lib/

Library utilities and helpers:

```
lib/
├── cacheSizing.js                    # Sizes the image cache from device memory
└── createImageIdsAndCacheMetaData.js  # Image ID creation and caching
```

## routes/

Route-level components for different views:

```
routes/
├── home.css
├── home.jsx                         # Home page route
│
├── dicom/
│   ├── RouteDicomReviewIEC.css
│   ├── RouteDicomReviewIEC.jsx      # DICOM IEC review route
│   ├── RouteDicomReviewVR.css
│   ├── RouteDicomReviewVR.jsx       # DICOM VR review route
│   └── RouteDump.jsx                # DICOM dump route
│
├── mask/
│   ├── RouteMaskIEC.css
│   ├── RouteMaskIEC.jsx             # Masking IEC route
│   ├── RouteMaskVR.css
│   └── RouteMaskVR.jsx              # Masking VR route
│
├── mask-review/
│   ├── RouteMaskReviewIEC.css
│   ├── RouteMaskReviewIEC.jsx       # Mask review IEC route
│   ├── RouteMaskReviewVR.css
│   └── RouteMaskReviewVR.jsx        # Mask review VR route
│
└── nifti/
    ├── RouteNiftiReviewFile.css
    ├── RouteNiftiReviewFile.jsx     # NIfTI file review route
    ├── RouteNiftiReviewVR.css
    └── RouteNiftiReviewVR.jsx       # NIfTI VR review route
```

## test/

Test configuration and utilities:

```
test/
└── setup.js                         # Test setup and configuration
```

---

## Summary

The src folder contains:
- **12 root-level files**: Core application files including entry points, utilities, and tests
- **7 asset files**: Logo and icon resources
- **52 component files** (26 pairs of .jsx + .css): Reusable UI components
- **1 config file**: Application configuration (`config.js`)
- **4 Redux slice files**: State management for counter, masking, options, and presentation
- **7 feature modules**: Organized by functionality (details, dicom-review, mask, mask-review, nifti-review, seg, stack-view, tools, volume-view)
- **2 custom hooks**: React hooks for configuration and resizing
- **1 library utility**: Image handling utilities
- **4 route modules**: Different viewing modes (home, dicom, mask, mask-review, nifti)
- **1 test setup file**: Testing configuration

### Abbreviations Used
- **IEC**: International Electrotechnical Commission (standard viewing orientation)
- **VR**: Volume Rendering
- **DICOM**: Digital Imaging and Communications in Medicine
- **NIfTI**: Neuroimaging Informatics Technology Initiative

### Total File Count
Approximately **146 files** in the src directory (excluding .DS_Store files).
