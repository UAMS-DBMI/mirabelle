// React
import React, {
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

// Components
import MiddleBottomPanel from "./MiddleBottomPanel.jsx";

// Context
import { Context } from "./Context.js";

// Cornerstone
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import {
  cornerstoneStreamingImageVolumeLoader,
  cornerstoneStreamingDynamicImageVolumeLoader,
} from "@cornerstonejs/streaming-image-volume-loader";
import cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import dicomParser from "dicom-parser";
import { cornerstoneNiftiImageVolumeLoader } from "@cornerstonejs/nifti-volume-loader";

// Utilities
import { expandSegTo3D, isSegFlag } from "../utilities";
import {
  setParameters,
  loaded,
  flagAsAccepted,
  flagAsRejected,
  flagAsSkipped,
  flagAsNonmaskable,
  submitFinalCoords,
} from "../masking";
import {
  getNiftiDetails,
  setNiftiStatus,
  getDicomDetails,
  setDicomStatus,
  setMaskingFlag,
} from "../visualreview";

function getOrCreateToolgroup(toolgroup_name) {
  let group = cornerstoneTools.ToolGroupManager.getToolGroup(toolgroup_name);
  if (group === undefined) {
    group = cornerstoneTools.ToolGroupManager.createToolGroup(toolgroup_name);
  }
  return group;
}

function ViewVolumePanel({ volumeName, files, iec }) {
  const context = useContext(Context);

  const [loading, setLoading] = useState(true);
  const [filesLoaded, setFilesLoaded] = useState(false);

  // set a state variable that will save each viewport's normal/expanded/minimized state
  const [expandedViewports, setExpandedViewports] = useState([
    { id: "axial", state: "normal" },
    { id: "sagittal", state: "normal" },
    { id: "coronal", state: "normal" },
    { id: "t3d_coronal", state: "normal" },
  ]);

  const renderingEngineId = "viewer_render_engine";
  const renderingEngineRef = useRef(null);
  const containerRef = useRef(null);

  let coords;
  let segId = "seg_id";
  let volumeId;

  if (context.nifti) {
    volumeId = `nifti:/papi/v1/files/${files[0]}/data`;
  } else {
    volumeId = "cornerstoneStreamingImageVolume: newVolume" + volumeName;
  }

  useLayoutEffect(() => {
    let volume = null;
    cornerstone.cache.purgeCache();

    const { volumeLoader } = cornerstone;

    function initVolumeLoader() {
      volumeLoader.registerUnknownVolumeLoader(
        cornerstoneStreamingImageVolumeLoader,
      );
      volumeLoader.registerVolumeLoader(
        "cornerstoneStreamingImageVolume",
        cornerstoneStreamingImageVolumeLoader,
      );
      volumeLoader.registerVolumeLoader(
        "cornerstoneStreamingDynamicImageVolume",
        cornerstoneStreamingDynamicImageVolumeLoader,
      );
      volumeLoader.registerVolumeLoader(
        "nifti",
        cornerstoneNiftiImageVolumeLoader,
      );
    }

    function initCornerstoneDICOMImageLoader() {
      const { preferSizeOverAccuracy, useNorm16Texture } =
        cornerstone.getConfiguration().rendering;
      cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
      cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;
      cornerstoneDICOMImageLoader.configure({
        useWebWorkers: true,
        decodeConfig: {
          convertFloatPixelDataToInt: false,
          use16BitDataType: preferSizeOverAccuracy || useNorm16Texture,
        },
      });

      let maxWebWorkers = 1;

      if (navigator.hardwareConcurrency) {
        maxWebWorkers = Math.min(navigator.hardwareConcurrency, 7);
      }

      const config = {
        maxWebWorkers,
        startWebWorkersOnDemand: false,
        taskConfiguration: {
          decodeTask: {
            initializeCodecsOnStartup: false,
            strict: false,
          },
        },
      };

      cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);
    }

    const resizeObserver = new ResizeObserver(() => {
      const renderingEngine = cornerstone.getRenderingEngine(
        "viewer_render_engine",
      );
      if (renderingEngine) {
        renderingEngine.resize(true, true);
      }
    });

    function setupVolumePanel(panelId) {
      const panelWrapper = document.createElement("div");
      const resizeButton = document.createElement("button");
      const panel = document.createElement("div");

      // set panelWrapper styles
      panelWrapper.id = panelId + "_wrapper";
      panelWrapper.style.display = "block";
      panelWrapper.style.width = "100%";
      panelWrapper.style.height = "100%";
      panelWrapper.style.position = "relative";
      panelWrapper.style.borderRadius = "8px";
      panelWrapper.style.overflow = "hidden";
      panelWrapper.style.backgroundColor = "black";
      panelWrapper.style.visibility = "hidden";

      // remove default button styling
      resizeButton.style.border = "none";
      resizeButton.style.outline = "none";
      resizeButton.style.cursor = "pointer";
      resizeButton.style.backgroundColor = "transparent";
      resizeButton.style.padding = "8px";

      // set resizeButton backgorund image to the resizeButtonLogo
      resizeButton.id = panelId + "_resize_button";
      //resizeButton.innerHTML = '<span class="material-symbols-rounded" style="color: white">open_in_full</span>';
      resizeButton.style.backgroundColor = "#424242";
      resizeButton.style.color = "white";
      resizeButton.classList.add("material-symbols-rounded");
      resizeButton.textContent = "open_in_full";
      // resizeButton.style.backgroundImage = `url(${resizeButtonLogo})`;
      // resizeButton.style.backgroundSize = 'contain';
      // resizeButton.style.backgroundRepeat = 'no-repeat';
      // resizeButton.style.backgroundPosition = 'center';
      // resizeButton.style.padding = '8px 8px';
      // resizeButton.style.paddingBottom = '3px';
      ///resizeButton.style.width = '30px';
      //resizeButton.style.height = '30px';
      resizeButton.style.position = "absolute";
      resizeButton.style.top = "10px";
      resizeButton.style.left = "10px";
      resizeButton.style.zIndex = "1000";
      resizeButton.style.display = "none";

      resizeButton.onmouseover = () => {
        resizeButton.style.backgroundColor = "rgb(59 130 246)";
      };
      resizeButton.onmouseleave = () => {
        resizeButton.style.backgroundColor = "#424242";
      };

      // set button to show when mouse is over panelWrapper
      panelWrapper.onmouseover = () => {
        resizeButton.style.display = "block";
      };
      panelWrapper.onmouseout = () => {
        resizeButton.style.display = "none";
      };

      // on resizeButton click, set the panelWrapper to be full viewport size
      resizeButton.onclick = (event) => {
        // panelWrapper.style.width = '100vw';
        // panelWrapper.style.height = '100vh';
        // panelWrapper.style.position = 'fixed';
        // panelWrapper.style.top = '0';
        // panelWrapper.style.left = '0';
        // panelWrapper.style.zIndex = '1000';
        // resizeButton.style.display = 'none';

        // Haydex: I can improve this code by using a state variable to keep track of the expanded viewport

        // Minimization
        if (event.currentTarget.parentNode.classList.contains("Expanded")) {
          event.currentTarget.textContent = "open_in_full";
          event.currentTarget.title = "Maximize";
          event.currentTarget.parentNode.classList.remove("Expanded");
          event.currentTarget.parentNode.style.gridColumn = "span 1";
          event.currentTarget.parentNode.style.gridRow = "span 1";
          // set the gridArea of the panelWrapper to the saved gridArea
          event.currentTarget.parentNode.style.gridArea =
            event.currentTarget.parentNode.getAttribute("data-gridArea");

          // Show all other minimized panelWrappers
          const allPanelWrappers =
            event.currentTarget.parentNode.parentNode.childNodes;
          allPanelWrappers.forEach((panelWrapper) => {
            if (panelWrapper.classList.contains("Minimized")) {
              panelWrapper.querySelector("button").title = "Maximize";
              panelWrapper.style.visibility = "visible";
              panelWrapper.style.display = "block";
              panelWrapper.classList.remove("Minimized");
            }
          });
          // render all viewports
          renderingEngineRef.current.getViewports().forEach((viewport) => {
            viewport.render();
          });
          // console.log('Minimized', event.currentTarget.parentNode.id);
        } else {
          // Maximization
          // console.log (event.currentTarget.parentNode.id);
          // Get the gridArea of the panelWrapper
          const gridArea = event.currentTarget.parentNode.style.gridArea;
          // save the gridArea into the panelWrapper
          event.currentTarget.parentNode.setAttribute(
            "data-gridArea",
            gridArea,
          );
          event.currentTarget.parentNode.style.gridColumn = "span 2";
          event.currentTarget.parentNode.style.gridRow = "span 2";
          event.currentTarget.parentNode.classList.add("Expanded");
          expandedViewports.id = event.currentTarget.parentNode.id;
          event.currentTarget.textContent = "close_fullscreen";
          event.currentTarget.title = "Minimize";

          // hide all other visible panelWrappers
          const allPanelWrappers =
            event.currentTarget.parentNode.parentNode.childNodes;
          allPanelWrappers.forEach((panelWrapper) => {
            if (
              panelWrapper.id !== event.currentTarget.parentNode.id &&
              panelWrapper.style.visibility === "visible"
            ) {
              panelWrapper.querySelector("button").title = "Minimize";
              panelWrapper.style.visibility = "hidden";
              panelWrapper.style.display = "none";
              panelWrapper.classList.add("Minimized");
            }
          });
          // render all viewports
          renderingEngineRef.current.getViewports().forEach((viewport) => {
            viewport.render();
          });
          // console.log('Expanded', event.currentTarget.parentNode.id);
        }
      };

      panel.id = panelId;
      panel.style.display = "block";
      panel.style.width = "100%";
      panel.style.height = "100%";
      panel.style.borderRadius = "8px";
      panel.style.overflow = "hidden";
      panel.style.backgroundColor = "black";
      panel.oncontextmenu = (e) => e.preventDefault();
      resizeObserver.observe(panel);

      // add resizebutton and panel to panelWrapper
      panelWrapper.appendChild(panel);
      panelWrapper.appendChild(resizeButton);

      return panelWrapper;
    }

    function setup3dViewportTools() {
      // Add tools if needed
      try {
        cornerstoneTools.addTool(cornerstoneTools.TrackballRotateTool);
      } catch (error) {}

      // Tool Group Setup
      const t3dToolGroup = getOrCreateToolgroup("t3d_tool_group");
      t3dToolGroup.addViewport("t3d_coronal", "viewer_render_engine");

      // Trackball Rotate
      t3dToolGroup.addTool(cornerstoneTools.TrackballRotateTool.toolName);
      t3dToolGroup.setToolActive(
        cornerstoneTools.TrackballRotateTool.toolName,
        {
          bindings: [
            {
              mouseButton: cornerstoneTools.Enums.MouseBindings.Primary, // Left Click
            },
          ],
        },
      );

      t3dToolGroup.addTool(cornerstoneTools.PanTool.toolName);
      t3dToolGroup.addTool(cornerstoneTools.ZoomTool.toolName);

      if (context.rightClickToolGroupValue === "pan") {
        // Pan
        // cornerstoneTools.addTool(cornerstoneTools.PanTool);
        t3dToolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
          bindings: [
            {
              mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary, // Right Click
            },
          ],
        });
      } else {
        // Zoom
        // cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
        t3dToolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
          bindings: [
            {
              mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary, // Right Click
            },
          ],
        });
      }

      // Pan
      t3dToolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
        bindings: [
          {
            mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary, // Middle Click
          },
        ],
      });

      // Segmentation Display
      // cornerstoneTools.addTool(cornerstoneTools.SegmentationDisplayTool);
      t3dToolGroup.addTool(cornerstoneTools.SegmentationDisplayTool.toolName);
      t3dToolGroup.setToolEnabled(
        cornerstoneTools.SegmentationDisplayTool.toolName,
      );
    }

    function setupVolViewportTools() {
      const viewportColors = {
        ["vol_axial"]: "rgb(200, 0, 0)",
        ["vol_sagittal"]: "rgb(200, 200, 0)",
        ["vol_coronal"]: "rgb(0, 200, 0)",
      };

      const viewportReferenceLineControllable = [
        "vol_axial",
        "vol_sagittal",
        "vol_coronal",
      ];

      const viewportReferenceLineDraggableRotatable = [
        "vol_axial",
        "vol_sagittal",
        "vol_coronal",
      ];

      const viewportReferenceLineSlabThicknessControlsOn = [
        "vol_axial",
        "vol_sagittal",
        "vol_coronal",
      ];

      function getReferenceLineColor(viewportId) {
        return viewportColors[viewportId];
      }

      function getReferenceLineControllable(viewportId) {
        const index = viewportReferenceLineControllable.indexOf(viewportId);
        return index !== -1;
      }

      function getReferenceLineDraggableRotatable(viewportId) {
        const index =
          viewportReferenceLineDraggableRotatable.indexOf(viewportId);
        return index !== -1;
      }

      function getReferenceLineSlabThicknessControlsOn(viewportId) {
        const index =
          viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId);
        return index !== -1;
      }

      try {
        cornerstoneTools.addTool(cornerstoneTools.RectangleScissorsTool);
        cornerstoneTools.addTool(cornerstoneTools.SegmentationDisplayTool);
        cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool);
        cornerstoneTools.addTool(cornerstoneTools.PanTool);
        cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
        cornerstoneTools.addTool(cornerstoneTools.CrosshairsTool);
        cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);
      } catch (error) {
        // console.log("errors while loading tools:", error);
      }

      // Create group and add viewports
      // TODO: should the render engine be coming from a var instead?
      const group = getOrCreateToolgroup("vol_tool_group");
      group.addViewport("vol_axial", "viewer_render_engine");
      group.addViewport("vol_sagittal", "viewer_render_engine");
      group.addViewport("vol_coronal", "viewer_render_engine");

      // Stack Scroll Tool
      group.addTool(cornerstoneTools.StackScrollMouseWheelTool.toolName);
      group.setToolActive(cornerstoneTools.StackScrollMouseWheelTool.toolName);

      group.addTool(cornerstoneTools.SegmentationDisplayTool.toolName);
      // group.setToolActive(cornerstoneTools.SegmentationDisplayTool.toolName);
      // group.setToolEnabled(cornerstoneTools.SegmentationDisplayTool.toolName);

      group.addTool(cornerstoneTools.RectangleScissorsTool.toolName);

      if (context.leftClickToolGroupValue === "selection") {
        group.setToolActive(cornerstoneTools.RectangleScissorsTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        });
      }

      group.addTool(cornerstoneTools.PanTool.toolName);
      group.addTool(cornerstoneTools.ZoomTool.toolName);

      if (context.rightClickToolGroupValue === "pan") {
        group.setToolActive(cornerstoneTools.PanTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
          ],
        });
      } else {
        group.setToolActive(cornerstoneTools.ZoomTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
          ],
        });
      }

      // Pan
      group.setToolActive(cornerstoneTools.PanTool.toolName, {
        bindings: [
          {
            mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary, // Middle Click
          },
        ],
      });

      // Window Level
      group.addTool(cornerstoneTools.WindowLevelTool.toolName);

      if (context.leftClickToolGroupValue === "windowlevel") {
        group.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
          bindings: [
            {
              mouseButton: cornerstoneTools.Enums.MouseBindings.Primary, // Left Click
            },
          ],
        });
      }

      group.addTool(cornerstoneTools.CrosshairsTool.toolName, {
        getReferenceLineColor,
        getReferenceLineControllable,
        getReferenceLineDraggableRotatable,
        getReferenceLineSlabThicknessControlsOn,
      });

      if (context.leftClickToolGroupValue === "crosshairs") {
        group.setToolActive(cornerstoneTools.CrosshairsTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        });
      }

      const volVOISyncronizer =
        cornerstoneTools.synchronizers.createVOISynchronizer(
          "vol_voi_syncronizer",
        );

      ["vol_axial", "vol_sagittal", "vol_coronal"].forEach((viewport) => {
        volVOISyncronizer.add({
          renderingEngineId: "viewer_render_engine",
          viewportId: viewport,
        });
      });
    }

    function setupMipViewportTools() {
      const viewportColors = {
        ["mip_axial"]: "rgb(200, 0, 0)",
        ["mip_sagittal"]: "rgb(200, 200, 0)",
        ["mip_coronal"]: "rgb(0, 200, 0)",
      };

      const viewportReferenceLineControllable = [
        "mip_axial",
        "mip_sagittal",
        "mip_coronal",
      ];

      const viewportReferenceLineDraggableRotatable = [
        "mip_axial",
        "mip_sagittal",
        "mip_coronal",
      ];

      const viewportReferenceLineSlabThicknessControlsOn = [
        "mip_axial",
        "mip_sagittal",
        "mip_coronal",
      ];

      function getReferenceLineColor(viewportId) {
        return viewportColors[viewportId];
      }

      function getReferenceLineControllable(viewportId) {
        const index = viewportReferenceLineControllable.indexOf(viewportId);
        return index !== -1;
      }

      function getReferenceLineDraggableRotatable(viewportId) {
        const index =
          viewportReferenceLineDraggableRotatable.indexOf(viewportId);
        return index !== -1;
      }

      function getReferenceLineSlabThicknessControlsOn(viewportId) {
        const index =
          viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId);
        return index !== -1;
      }

      try {
        cornerstoneTools.addTool(cornerstoneTools.RectangleScissorsTool);
        cornerstoneTools.addTool(cornerstoneTools.SegmentationDisplayTool);
        cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool);
        cornerstoneTools.addTool(cornerstoneTools.PanTool);
        cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
        cornerstoneTools.addTool(cornerstoneTools.CrosshairsTool);
        cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);
      } catch (error) {
        // console.log("errors while loading tools:", error);
      }

      // Create group and add viewports
      // TODO: should the render engine be coming from a var instead?
      const group = getOrCreateToolgroup("mip_tool_group");
      group.addViewport("mip_axial", "viewer_render_engine");
      group.addViewport("mip_sagittal", "viewer_render_engine");
      group.addViewport("mip_coronal", "viewer_render_engine");

      // Stack Scroll Tool
      group.addTool(cornerstoneTools.StackScrollMouseWheelTool.toolName);
      group.setToolActive(cornerstoneTools.StackScrollMouseWheelTool.toolName);

      group.addTool(cornerstoneTools.SegmentationDisplayTool.toolName);
      // group.setToolActive(cornerstoneTools.SegmentationDisplayTool.toolName);
      // group.setToolEnabled(cornerstoneTools.SegmentationDisplayTool.toolName);

      group.addTool(cornerstoneTools.RectangleScissorsTool.toolName);

      if (context.leftClickToolGroupValue === "selection") {
        group.setToolActive(cornerstoneTools.RectangleScissorsTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        });
      }

      group.addTool(cornerstoneTools.PanTool.toolName);
      group.addTool(cornerstoneTools.ZoomTool.toolName);

      if (context.rightClickToolGroupValue === "pan") {
        group.setToolActive(cornerstoneTools.PanTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
          ],
        });
      } else {
        group.setToolActive(cornerstoneTools.ZoomTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
          ],
        });
      }

      // Pan
      group.setToolActive(cornerstoneTools.PanTool.toolName, {
        bindings: [
          {
            mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary, // Middle Click
          },
        ],
      });

      // Window Level
      group.addTool(cornerstoneTools.WindowLevelTool.toolName);

      if (context.leftClickToolGroupValue === "windowlevel") {
        group.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
          bindings: [
            {
              mouseButton: cornerstoneTools.Enums.MouseBindings.Primary, // Left Click
            },
          ],
        });
      }

      group.addTool(cornerstoneTools.CrosshairsTool.toolName, {
        getReferenceLineColor,
        getReferenceLineControllable,
        getReferenceLineDraggableRotatable,
        getReferenceLineSlabThicknessControlsOn,
      });

      if (context.leftClickToolGroupValue === "crosshairs") {
        group.setToolActive(cornerstoneTools.CrosshairsTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        });
      }

      const mipVOISyncronizer =
        cornerstoneTools.synchronizers.createVOISynchronizer(
          "mip_voi_syncronizer",
        );

      ["mip_axial", "mip_sagittal", "mip_coronal"].forEach((viewport) => {
        mipVOISyncronizer.add({
          renderingEngineId: "viewer_render_engine",
          viewportId: viewport,
        });
      });
    }

    async function run() {
      if (!loaded.loaded) {
        await cornerstone.init();
        cornerstoneTools.init();
        initVolumeLoader();
        initCornerstoneDICOMImageLoader();
        loaded.loaded = true;
      }

      const renderingEngine = new cornerstone.RenderingEngine(
        "viewer_render_engine",
      );
      renderingEngineRef.current = renderingEngine;

      const container = containerRef.current;
      container.innerHTML = ""; // Clear previous content

      const viewportInput = [];

      container.style.display = "grid";
      if (context.viewToolGroupValue === "all") {
        container.style.gridTemplateColumns = "repeat(3, 1fr)";
        container.style.gridTemplateRows = "repeat(3, 1fr)";
      } else {
        container.style.gridTemplateColumns = "repeat(2, 1fr)";
        container.style.gridTemplateRows = "repeat(2, 1fr)";
      }

      container.style.gridGap = "6px";
      container.style.width = "100%";
      container.style.height = "100%";

      const volAxialContent = setupVolumePanel("vol_axial");
      const volSagittalContent = setupVolumePanel("vol_sagittal");
      const volCoronalContent = setupVolumePanel("vol_coronal");
      const mipAxialContent = setupVolumePanel("mip_axial");
      const mipSagittalContent = setupVolumePanel("mip_sagittal");
      const mipCoronalContent = setupVolumePanel("mip_coronal");
      const t3dCoronalContent = setupVolumePanel("t3d_coronal");

      container.appendChild(volAxialContent);
      container.appendChild(volSagittalContent);
      container.appendChild(volCoronalContent);
      container.appendChild(mipAxialContent);
      container.appendChild(mipSagittalContent);
      container.appendChild(mipCoronalContent);
      container.appendChild(t3dCoronalContent);

      viewportInput.push(
        {
          viewportId: "vol_axial",
          type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
          element: volAxialContent.childNodes[0],
          defaultOptions: {
            orientation: cornerstone.Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: "vol_sagittal",
          type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
          element: volSagittalContent.childNodes[0],
          defaultOptions: {
            orientation: cornerstone.Enums.OrientationAxis.SAGITTAL,
          },
        },
        {
          viewportId: "vol_coronal",
          type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
          element: volCoronalContent.childNodes[0],
          defaultOptions: {
            orientation: cornerstone.Enums.OrientationAxis.CORONAL,
          },
        },
        {
          viewportId: "mip_axial",
          type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
          element: mipAxialContent.childNodes[0],
          defaultOptions: {
            orientation: cornerstone.Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: "mip_sagittal",
          type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
          element: mipSagittalContent.childNodes[0],
          defaultOptions: {
            orientation: cornerstone.Enums.OrientationAxis.SAGITTAL,
          },
        },
        {
          viewportId: "mip_coronal",
          type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
          element: mipCoronalContent.childNodes[0],
          defaultOptions: {
            orientation: cornerstone.Enums.OrientationAxis.CORONAL,
          },
        },
        {
          viewportId: "t3d_coronal",
          type: cornerstone.Enums.ViewportType.VOLUME_3D,
          element: t3dCoronalContent.childNodes[0],
          defaultOptions: {
            orientation: cornerstone.Enums.OrientationAxis.CORONAL,
          },
        },
      );

      renderingEngine.setViewports(viewportInput);

      setupVolViewportTools();
      setupMipViewportTools();
      setup3dViewportTools();

      setLoading(false);
    }

    run();

    return () => {
      cornerstone.cache.purgeCache();
      resizeObserver.disconnect();
    };
  }, [context.layout]);

  // ----------------------------------------------------
  // Set the viewports based on the viewToolGroupValue
  useEffect(() => {
    // check if files are loaded before setting viewports
    if (!filesLoaded) {
      return;
    }

    // console.log("viewports loaded");

    const container = containerRef.current;

    const volAxialContent = document.getElementById("vol_axial_wrapper");
    const volSagittalContent = document.getElementById("vol_sagittal_wrapper");
    const volCoronalContent = document.getElementById("vol_coronal_wrapper");
    const mipAxialContent = document.getElementById("mip_axial_wrapper");
    const mipSagittalContent = document.getElementById("mip_sagittal_wrapper");
    const mipCoronalContent = document.getElementById("mip_coronal_wrapper");
    const t3dCoronalContent = document.getElementById("t3d_coronal_wrapper");

    if (context.viewToolGroupValue === "volume") {
      // Haydex: I can improve this code by using a state variable to keep track of the expanded viewport

      // remove all viewports Minimized and Expanded classes
      const allPanelWrappers = container.childNodes;
      allPanelWrappers.forEach((panelWrapper) => {
        panelWrapper.classList.remove("Minimized");
        panelWrapper.classList.remove("Expanded");
        panelWrapper.querySelector("button").textContent = "open_in_full";
        panelWrapper.querySelector("button").title = "Maximize";
      });

      container.style.gridTemplateColumns = "repeat(2, 1fr)";
      container.style.gridTemplateRows = "repeat(2, 1fr)";

      // set volume viewport panels to be visible

      volAxialContent.style.visibility = "visible";
      volSagittalContent.style.visibility = "visible";
      volCoronalContent.style.visibility = "visible";
      volAxialContent.style.display = "block";
      volSagittalContent.style.display = "block";
      volCoronalContent.style.display = "block";

      mipAxialContent.style.visibility = "hidden";
      mipSagittalContent.style.visibility = "hidden";
      mipCoronalContent.style.visibility = "hidden";
      mipAxialContent.style.display = "none";
      mipSagittalContent.style.display = "none";
      mipCoronalContent.style.display = "none";

      t3dCoronalContent.style.visibility = "visible";
      t3dCoronalContent.style.display = "block";

      // move t3dCoronalContent to the top right cell of the grid
      t3dCoronalContent.style.gridColumn = 2;
      t3dCoronalContent.style.gridRow = 1;

      // move volCoronalContent to the bottom left cell of the grid
      volCoronalContent.style.gridColumn = 1;
      volCoronalContent.style.gridRow = 2;

      volSagittalContent.style.gridColumn = 2;
      volSagittalContent.style.gridRow = 2;

      volAxialContent.style.gridColumn = 1;
      volAxialContent.style.gridRow = 1;

      // t3dCoronalContent.style.gridColumn = 'span 3';
    } else if (context.viewToolGroupValue === "projection") {
      // We can improve this code by using a state variable to keep track of the expanded viewport

      // remove all viewports Minimized and Expanded classes
      const allPanelWrappers = container.childNodes;
      allPanelWrappers.forEach((panelWrapper) => {
        panelWrapper.classList.remove("Minimized");
        panelWrapper.classList.remove("Expanded");
      });

      container.style.gridTemplateColumns = "repeat(2, 1fr)";
      container.style.gridTemplateRows = "repeat(2, 1fr)";

      // set projection viewport panels to be visible
      volAxialContent.style.visibility = "hidden";
      volSagittalContent.style.visibility = "hidden";
      volCoronalContent.style.visibility = "hidden";
      volAxialContent.style.display = "none";
      volSagittalContent.style.display = "none";
      volCoronalContent.style.display = "none";

      mipAxialContent.style.visibility = "visible";
      mipSagittalContent.style.visibility = "visible";
      mipCoronalContent.style.visibility = "visible";
      mipAxialContent.style.display = "block";
      mipSagittalContent.style.display = "block";
      mipCoronalContent.style.display = "block";

      t3dCoronalContent.style.visibility = "visible";
      t3dCoronalContent.style.display = "block";

      // move t3dCoronalContent to the top right cell of the grid
      t3dCoronalContent.style.gridColumn = 2;
      t3dCoronalContent.style.gridRow = 1;

      // move mipCoronalContent to the bottom left cell of the grid
      mipCoronalContent.style.gridColumn = 1;
      mipCoronalContent.style.gridRow = 2;

      mipSagittalContent.style.gridColumn = 2;
      mipSagittalContent.style.gridRow = 2;

      mipAxialContent.style.gridColumn = 1;
      mipAxialContent.style.gridRow = 1;

      // t3dCoronalContent.style.gridColumn = 'span 3';
    }
  }, [context.viewToolGroupValue, filesLoaded]);

  // ----------------------------------------------------
  // Load the actual volume into the display here
  useEffect(() => {
    cornerstone.cache.purgeCache();

    // do nothing if Cornerstone is still loading
    if (loading) {
      return;
    }

    // TODO: not sure if this is helpful here
    cornerstone.cache.purgeCache();
    cornerstone.cache.purgeVolumeCache();

    let volume = null;
    let stack = files;
    const renderingEngine = renderingEngineRef.current;

    async function getFileData() {
      if (context.nifti) {
        // console.log("volumeId:", volumeId);
        volume = await cornerstone.volumeLoader.createAndCacheVolume(volumeId, {
          type: "image",
        });
      } else {
        volume = await cornerstone.volumeLoader.createAndCacheVolume(volumeId, {
          imageIds: files,
        });
      }
    }

    async function doit() {
      window.cornerstone = cornerstone;
      window.cornerstoneTools = cornerstoneTools;
      await getFileData();

      if (context.viewport_layout == "stack") {
        const viewport = renderingEngine.getViewport("dicom_stack");
        //console.log(stack)
        //console.log(renderingEngine)
        await viewport.setStack(stack);

        //viewport.render();

        const currentImageId = viewport.getCurrentImageId();

        // Create a derived segmentation image for the current image
        const { imageId: newSegImageId } =
          await cornerstone.imageLoader.createAndCacheDerivedSegmentationImage(
            currentImageId,
          );

        // Add the segmentation to the segmentation state
        cornerstoneTools.segmentation.addSegmentations([
          {
            segmentationId: segId,
            representation: {
              type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
              data: {
                imageIdReferenceMap: new Map([[currentImageId, newSegImageId]]),
              },
            },
          },
        ]);

        // Add the segmentation representation to the tool group
        await cornerstoneTools.segmentation.addSegmentationRepresentations(
          "stack_tool_group",
          [
            {
              segmentationId: segId,
              type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
            },
          ],
        );
      } else if (context.viewport_layout == "volume") {
        volume.load();

        // Add volumes to volume viewports
        await cornerstone.setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          ["vol_axial", "vol_sagittal", "vol_coronal"],
        );

        const volDimensions = volume.dimensions;

        const volSlab = Math.sqrt(
          volDimensions[0] * volDimensions[0] +
            volDimensions[1] * volDimensions[1] +
            volDimensions[2] * volDimensions[2],
        );

        // Add volumes to MIP viewports
        await cornerstone.setVolumesForViewports(
          renderingEngine,
          [
            //https://www.cornerstonejs.org/api/core/namespace/Types#IVolumeInput
            {
              volumeId: volumeId,
              blendMode: cornerstone.Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
              slabThickness: volSlab,
            },
          ],
          ["mip_axial", "mip_sagittal", "mip_coronal"],
        );

        await cornerstone
          .setVolumesForViewports(
            renderingEngine,
            [{ volumeId: volumeId }],
            ["t3d_coronal"],
          )
          .then(() => {
            const viewport = renderingEngine.getViewport("t3d_coronal");
            viewport.setProperties({ preset: context.presetToolValue });
          });

        //// make sure it doesn't already exist
        //cornerstoneTools.segmentation.state.removeSegmentation(segId);
        //cornerstoneTools.segmentation.state.removeSegmentationRepresentations('t3d_tool_group');

        // create and bind a new segmentation
        await cornerstone.volumeLoader.createAndCacheDerivedSegmentationVolume(
          volumeId,
          { volumeId: segId },
        );

        cornerstoneTools.segmentation.addSegmentations([
          {
            segmentationId: segId,
            representation: {
              type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
              data: {
                volumeId: segId,
              },
            },
          },
        ]);

        await cornerstoneTools.segmentation.addSegmentationRepresentations(
          "vol_tool_group",
          [
            {
              segmentationId: segId,
              type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
            },
          ],
        );

        await cornerstoneTools.segmentation.addSegmentationRepresentations(
          "mip_tool_group",
          [
            {
              segmentationId: segId,
              type: cornerstoneTools.Enums.SegmentationRepresentations.Labelmap,
            },
          ],
        );
      }

      setFilesLoaded(true);
    }

    doit();
  }, [files, loading]);

  // ----------------------------------------------------
  // Load presets when component mounts
  useEffect(() => {
    const loadPresets = () => {
      const fetchedPresets = cornerstone.CONSTANTS.VIEWPORT_PRESETS.map(
        (preset) => preset.name,
      );
      context.setPresetToolList(fetchedPresets);
    };

    if (context.presetToolList.length === 0) {
      loadPresets();
    }
  }, [context.presetToolList, context.setPresetToolList]);

  // ----------------------------------------------------
  // Handle changes to the `preset` prop
  useEffect(() => {
    const renderingEngine = renderingEngineRef.current;
    if (renderingEngine) {
      const viewport = renderingEngine.getViewport("t3d_coronal");
      viewport.setProperties({ preset: context.presetToolValue });
      // console.log(cornerstone.cache.getVolumes());
    }
  }, [context.presetToolValue]);

  // ----------------------------------------------------
  // Handle changes to the `opacity` prop
  useEffect(() => {
    const renderingEngine = renderingEngineRef.current;
    if (renderingEngine) {
      const viewport = renderingEngine.getViewport("t3d_coronal");
      if (viewport) {
        const actorEntry = viewport.getActors()[0];
        if (actorEntry && actorEntry.actor) {
          const volumeActor = actorEntry.actor;
          const property = volumeActor.getProperty();
          const opacityFunction = property.getScalarOpacity(0);

          opacityFunction.removeAllPoints();
          opacityFunction.addPoint(0, 0.0);
          opacityFunction.addPoint(500, context.opacityToolValue);
          opacityFunction.addPoint(1000, context.opacityToolValue);
          opacityFunction.addPoint(1500, context.opacityToolValue);
          opacityFunction.addPoint(2000, context.opacityToolValue);

          property.setScalarOpacity(0, opacityFunction);
          viewport.render();
        }
      }
    }
  }, [context.opacityToolValue]);

  // ----------------------------------------------------
  // Handle changes to the `left click` prop
  useEffect(() => {
    if (context.viewport_layout == "stack") {
      const stackToolGroup =
        cornerstoneTools.ToolGroupManager.getToolGroup("stack_tool_group");

      if (stackToolGroup) {
        // Activate or deactivate the WindowLevelTool based on the windowLevel state
        if (context.leftClickToolGroupValue === "windowlevel") {
          stackToolGroup.setToolActive(
            cornerstoneTools.WindowLevelTool.toolName,
            {
              bindings: [
                { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
              ],
            },
          );
        } else {
          stackToolGroup.setToolDisabled(
            cornerstoneTools.WindowLevelTool.toolName,
          );
        }

        if (context.leftClickToolCrossHairsVisible) {
          // Activate or deactivate the CrosshairsTool based on the crosshairs state
          if (context.leftClickToolGroupValue === "crosshairs") {
            stackToolGroup.setToolActive(
              cornerstoneTools.CrosshairsTool.toolName,
              {
                bindings: [
                  { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
                ],
              },
            );
          } else {
            stackToolGroup.setToolDisabled(
              cornerstoneTools.CrosshairsTool.toolName,
            );
          }
        }

        // Activate or deactivate the RectangleScissorsTool based on the rectangleScissors state
        if (context.leftClickToolGroupValue === "selection") {
          stackToolGroup.setToolActive(
            cornerstoneTools.RectangleScissorsTool.toolName,
            {
              bindings: [
                { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
              ],
            },
          );
        } else {
          stackToolGroup.setToolDisabled(
            cornerstoneTools.RectangleScissorsTool.toolName,
          );
        }
      }
    } else if (context.viewport_layout == "volume") {
      // Volumes
      const volToolGroup =
        cornerstoneTools.ToolGroupManager.getToolGroup("vol_tool_group");

      if (volToolGroup) {
        // Activate or deactivate the WindowLevelTool based on the windowLevel state
        if (context.leftClickToolGroupValue === "windowlevel") {
          volToolGroup.setToolActive(
            cornerstoneTools.WindowLevelTool.toolName,
            {
              bindings: [
                { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
              ],
            },
          );
        } else {
          volToolGroup.setToolDisabled(
            cornerstoneTools.WindowLevelTool.toolName,
          );
        }

        // Activate or deactivate the CrosshairsTool based on the crosshairs state
        if (context.leftClickToolGroupValue === "crosshairs") {
          volToolGroup.setToolActive(cornerstoneTools.CrosshairsTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
            ],
          });
        } else {
          volToolGroup.setToolDisabled(
            cornerstoneTools.CrosshairsTool.toolName,
          );
        }

        // Activate or deactivate the RectangleScissorsTool based on the rectangleScissors state
        if (context.leftClickToolGroupValue === "selection") {
          volToolGroup.setToolActive(
            cornerstoneTools.RectangleScissorsTool.toolName,
            {
              bindings: [
                { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
              ],
            },
          );
        } else {
          volToolGroup.setToolDisabled(
            cornerstoneTools.RectangleScissorsTool.toolName,
          );
        }
      }

      // MIPs
      const mipToolGroup =
        cornerstoneTools.ToolGroupManager.getToolGroup("mip_tool_group");

      if (mipToolGroup) {
        // Activate or deactivate the WindowLevelTool based on the windowLevel state
        if (context.leftClickToolGroupValue === "windowlevel") {
          mipToolGroup.setToolActive(
            cornerstoneTools.WindowLevelTool.toolName,
            {
              bindings: [
                { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
              ],
            },
          );
        } else {
          mipToolGroup.setToolDisabled(
            cornerstoneTools.WindowLevelTool.toolName,
          );
        }

        // Activate or deactivate the CrosshairsTool based on the crosshairs state
        if (context.leftClickToolGroupValue === "crosshairs") {
          mipToolGroup.setToolActive(cornerstoneTools.CrosshairsTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
            ],
          });
        } else {
          mipToolGroup.setToolDisabled(
            cornerstoneTools.CrosshairsTool.toolName,
          );
        }

        // Activate or deactivate the RectangleScissorsTool based on the rectangleScissors state
        if (context.leftClickToolGroupValue === "selection") {
          mipToolGroup.setToolActive(
            cornerstoneTools.RectangleScissorsTool.toolName,
            {
              bindings: [
                { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
              ],
            },
          );
        } else {
          mipToolGroup.setToolDisabled(
            cornerstoneTools.RectangleScissorsTool.toolName,
          );
        }
      }
    }
  }, [context.leftClickToolGroupValue]);

  // ----------------------------------------------------
  // Handle changes to the `right click` prop
  useEffect(() => {
    if (context.viewport_layout == "stack") {
      // Stacks
      const stackToolGroup =
        cornerstoneTools.ToolGroupManager.getToolGroup("stack_tool_group");
      if (context.rightClickToolGroupValue === "pan") {
        if (stackToolGroup) {
          stackToolGroup.setToolDisabled(cornerstoneTools.ZoomTool.toolName);
          stackToolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
        }
      } else {
        if (stackToolGroup) {
          stackToolGroup.setToolDisabled(cornerstoneTools.PanTool.toolName);
          stackToolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
        }
      }
    } else if (context.viewport_layout == "volume") {
      // Volumes
      const volToolGroup =
        cornerstoneTools.ToolGroupManager.getToolGroup("vol_tool_group");
      if (context.rightClickToolGroupValue === "pan") {
        if (volToolGroup) {
          volToolGroup.setToolDisabled(cornerstoneTools.ZoomTool.toolName);
          volToolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
        }
      } else {
        if (volToolGroup) {
          volToolGroup.setToolDisabled(cornerstoneTools.PanTool.toolName);
          volToolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
        }
      }

      // MIPs
      const mipToolGroup =
        cornerstoneTools.ToolGroupManager.getToolGroup("mip_tool_group");
      if (context.rightClickToolGroupValue === "pan") {
        if (mipToolGroup) {
          mipToolGroup.setToolDisabled(cornerstoneTools.ZoomTool.toolName);
          mipToolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
        }
      } else {
        if (mipToolGroup) {
          mipToolGroup.setToolDisabled(cornerstoneTools.PanTool.toolName);
          mipToolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
        }
      }

      // 3D
      const t3dToolGroup =
        cornerstoneTools.ToolGroupManager.getToolGroup("t3d_tool_group");
      if (context.rightClickToolGroupValue === "pan") {
        if (t3dToolGroup) {
          t3dToolGroup.setToolDisabled(cornerstoneTools.ZoomTool.toolName);
          t3dToolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
        }
      } else {
        if (t3dToolGroup) {
          t3dToolGroup.setToolDisabled(cornerstoneTools.PanTool.toolName);
          t3dToolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
        }
      }
    }
  }, [context.rightClickToolGroupValue]);

  // ----------------------------------------------------
  // Handle changes to the `reset viewports` prop
  useEffect(() => {
    if (context.resetViewportsValue) {
      // Reset View
      if (context.viewToolGroupVisible) {
        //// Haydex: I can improve this code by using a state variable to keep track of the expanded viewport
        context.setViewToolGroupValue(context.viewToolGroupValue + " "); // force a re-render
        setTimeout(() => {
          context.setViewToolGroupValue(context.viewToolGroupValue);
        }, 50);
        //context.setViewToolGroupValue(context.viewToolGroupValue);
      }

      // Reset Function
      if (context.functionToolGroupVisible) {
        context.setFunctionToolGroupValue(context.functionToolGroupValue);
      }

      // Reset Form
      if (context.formToolGroupVisible) {
        context.setFormToolGroupValue(context.formToolGroupValue);
      }

      // Reset left click
      if (context.leftClickToolGroupVisible) {
        context.setLeftClickToolGroupValue(context.leftClickToolGroupValue);
      }

      // Reset right click
      if (context.rightClickToolGroupVisible) {
        context.setRightClickToolGroupValue(context.rightClickToolGroupValue);
      }

      // Reset Opacity
      if (context.opacityToolVisible) {
        context.setOpacityToolValue(context.opacityToolValue);
      }

      // Reset Preset
      if (context.presetToolVisible) {
        context.setPresetToolValue(context.presetToolValue);
      }

      // reset cameras for all the viewports that its wrapper is visible
      const renderingEngine = renderingEngineRef.current;
      renderingEngine.getViewports().forEach((viewport) => {
        // if the viewport parent node is visible, reset camera
        const viewportElement = document.getElementById(viewport.id);
        if (viewportElement.parentNode.style.display !== "none") {
          viewport.resetCamera(true, true, true, true);
          viewport.render();
        }
      });

      // Remove all segmentations
      const segVolume = cornerstone.cache.getVolume(segId);
      //console.log("segVolume is", segVolume);
      const scalarData = segVolume.scalarData;
      // console.log("scalarData is", scalarData);
      scalarData.fill(0);
      // redraw segmentation
      cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
        segId,
      );

      // Wait 100ms then reset the cameras and crosshairs of all the viewports that its wrapper is visible
      setTimeout(() => {
        // if the viewport parent node is visible, reset camera
        renderingEngine.getViewports().forEach((viewport) => {
          const viewportElement = document.getElementById(viewport.id);
          if (viewportElement.parentNode.style.display !== "none") {
            viewport.resetCamera(true, true, true, true);
            viewport.render();
          }
        });

        // reset crosshairs tool slab thickness if the volume viewport is visible
        if (
          document.getElementById("vol_axial_wrapper").style.display !== "none"
        ) {
          const volToolGroup =
            cornerstoneTools.ToolGroupManager.getToolGroup("vol_tool_group");
          const crosshairsToolInstance = volToolGroup.getToolInstance(
            cornerstoneTools.CrosshairsTool.toolName,
          );
          crosshairsToolInstance.resetCrosshairs();
        }
      }, 150);
    }
    context.setResetViewportsValue(false);
  }, [context.resetViewportsValue]);

  async function handleExpandSelection() {
    if (isSegFlag(segId)) {
      alert(
        "Cannot expand flat selection! You must draw in at least two planes.",
      );
      return;
    }
    // console.log('handleExpandSelection called, setId is', segId);
    coords = expandSegTo3D(segId);

    cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      segId,
    );

    await cornerstoneTools.segmentation.addSegmentationRepresentations(
      "t3d_tool_group",
      [
        {
          segmentationId: segId,
          type: cornerstoneTools.Enums.SegmentationRepresentations.Surface,
          options: {
            polySeg: {
              enabled: true,
            },
          },
        },
      ],
    );
  }
  async function handleClearSelection() {
    const segVolume = cornerstone.cache.getVolume(segId);
    const scalarData = segVolume.scalarData;
    scalarData.fill(0);

    // redraw segmentation
    cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      segId,
    );
  }
  async function handleAcceptSelection() {
    if (coords === undefined) {
      alert("You must Expand Selection first!");
      return;
    }
    const maskForm = context.formToolGroupValue;
    const maskFunction = context.functionToolGroupValue;
    const volume = cornerstone.cache.getVolume(volumeId);
    const spacing = volume.spacing;
    await submitFinalCoords(coords, spacing, iec, maskForm, maskFunction);
    context.showToast("Submitted for masking!");
  }
  async function handleMarkAccepted() {
    await flagAsAccepted(iec);
    context.showToast("Marked as accepted!");
  }
  async function handleMarkRejected() {
    await flagAsRejected(iec);
    context.showToast("Marked as rejected!");
  }
  async function handleMarkSkipped() {
    await flagAsSkipped(iec);
    context.showToast("Marked as skipped!");
  }
  async function handleMarkNonmaskable() {
    await flagAsNonmaskable(iec);
    context.showToast("Marked as Non-Maskable!");
  }
  async function handleMarkGood() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Good");
    } else {
      await setDicomStatus(iec, "Good");
    }
    context.showToast("Marked as Good!");
  }
  async function handleMarkBad() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Bad");
    } else {
      await setDicomStatus(iec, "Bad");
    }
    context.showToast("Marked as Bad!");
  }
  async function handleMarkBlank() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Blank");
    } else {
      await setDicomStatus(iec, "Blank");
    }
    context.showToast("Marked as Blank!");
  }
  async function handleMarkScout() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Scout");
    } else {
      await setDicomStatus(iec, "Scout");
    }
    context.showToast("Marked as Scout!");
  }
  async function handleMarkOther() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Other");
    } else {
      await setDicomStatus(iec, "Other");
    }
    context.showToast("Marked as Other!");
  }
  async function handleMarkFlag() {
    if (context.nifti) {
      await setMaskingFlag(files[0]);
    } else {
      await setMaskingFlag(iec);
    }
    context.showToast("Flagged for Masking");
  }

  return (
    <>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
        id="container"
      ></div>
      <MiddleBottomPanel
        onAccept={handleAcceptSelection}
        onClear={handleClearSelection}
        onExpand={handleExpandSelection}
        onMarkAccepted={handleMarkAccepted}
        onMarkRejected={handleMarkRejected}
        onMarkSkip={handleMarkSkipped}
        onMarkNonMaskable={handleMarkNonmaskable}
        onMarkGood={handleMarkGood}
        onMarkBad={handleMarkBad}
        onMarkBlank={handleMarkBlank}
        onMarkScout={handleMarkScout}
        onMarkOther={handleMarkOther}
        onMarkFlag={handleMarkFlag}
      />
    </>
  );
}

export default ViewVolumePanel;
