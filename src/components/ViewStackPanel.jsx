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
import cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import dicomParser from "dicom-parser";

// Utilities
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
import { log } from "mathjs";

function getOrCreateToolgroup(toolgroup_name) {
  let group = cornerstoneTools.ToolGroupManager.getToolGroup(toolgroup_name);
  if (group === undefined) {
    group = cornerstoneTools.ToolGroupManager.createToolGroup(toolgroup_name);
  }
  return group;
}

function ViewStackPanel({ volumeName, files, iec }) {
  const context = useContext(Context);

  const [loading, setLoading] = useState(true);
  const [filesLoaded, setFilesLoaded] = useState(false);

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

    function setupStackPanel(stackViewerId) {
      const panelWrapper = document.createElement("div");
      const panel = document.createElement("div");

      // set panelWrapper styles
      panelWrapper.id = stackViewerId + "_wrapper";
      panelWrapper.style.display = "block";
      panelWrapper.style.width = "100%";
      panelWrapper.style.height = "100%";
      panelWrapper.style.position = "relative";
      panelWrapper.style.borderRadius = "8px";
      panelWrapper.style.overflow = "hidden";
      panelWrapper.style.backgroundColor = "black";
      // panelWrapper.style.visibility = 'hidden';

      panel.id = stackViewerId;
      panel.style.display = "block";
      panel.style.width = "100%";
      panel.style.height = "100%";
      panel.style.borderRadius = "8px";
      panel.style.overflow = "hidden";
      panel.style.backgroundColor = "black";
      panel.oncontextmenu = (e) => e.preventDefault();
      resizeObserver.observe(panel);

      panelWrapper.appendChild(panel);

      return panelWrapper;
    }

    function setupStackViewportTools() {
      // Tools

      // Group
      const group = getOrCreateToolgroup("stack_tool_group");
      group.addViewport("dicom_stack", renderingEngineId);

      // WindowLevelTool
      cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);
      group.addTool(cornerstoneTools.WindowLevelTool.toolName);

      // Activate or deactivate the WindowLevelTool based on the windowLevel state
      if (context.leftClickToolGroupValue === "windowlevel") {
        group.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        });
      }

      // Pan and Zoom tools
      cornerstoneTools.addTool(cornerstoneTools.PanTool);
      cornerstoneTools.addTool(cornerstoneTools.ZoomTool);

      group.addTool(cornerstoneTools.PanTool.toolName);
      group.addTool(cornerstoneTools.ZoomTool.toolName);

      if (context.rightClickToolGroupValue === "pan") {
        group.setToolActive(cornerstoneTools.PanTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
          ],
        });

        //console.log('pan activated');
      } else {
        group.setToolActive(cornerstoneTools.ZoomTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
          ],
        });

        //console.log('pan activated');
      }

      // StackScrollTool
      cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool);
      group.addTool(cornerstoneTools.StackScrollMouseWheelTool.toolName);

      // Activate the StackScrollTool for the middle mouse button
      group.setToolActive(cornerstoneTools.StackScrollMouseWheelTool.toolName);

      // Segmentations
      cornerstoneTools.addTool(cornerstoneTools.SegmentationDisplayTool);

      group.addTool(cornerstoneTools.SegmentationDisplayTool.toolName);
      group.setToolActive(cornerstoneTools.SegmentationDisplayTool.toolName);

      // RectangleScissorsTool
      cornerstoneTools.addTool(cornerstoneTools.RectangleScissorsTool);

      // Activate the RectangleScissorsTool
      group.addTool(cornerstoneTools.RectangleScissorsTool.toolName);

      if (context.leftClickToolGroupValue === "selection") {
        group.setToolActive(cornerstoneTools.RectangleScissorsTool.toolName, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        });

        //console.log('selection activated');
      }
    }

    async function run() {
      if (!loaded.loaded) {
        await cornerstone.init();
        cornerstoneTools.init();
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

      // Single Image Viewer

      // Container
      container.style.display = "block";
      container.style.width = "100%";
      container.style.height = "100%";

      // Viewer
      const stackContent = setupStackPanel("stackViewer");
      container.appendChild(stackContent);

      viewportInput.push({
        viewportId: "dicom_stack",
        type: cornerstone.Enums.ViewportType.STACK,
        element: stackContent.childNodes[0],
      });
      renderingEngine.setViewports(viewportInput);

      setupStackViewportTools();

      setLoading(false);
    }

    run();

    return () => {
      cornerstone.cache.purgeCache();
      resizeObserver.disconnect();
    };
  }, [context.layout]);

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
    console.log("files are", files);
    let stack = files;
    const renderingEngine = renderingEngineRef.current;

    async function getFileData() {
      if (context.viewport_layout == "volume") {
        // TODO: could probably use a better way to generate unique volumeIds
        if (context.nifti) {
          // console.log("volumeId:", volumeId);
          volume = await cornerstone.volumeLoader.createAndCacheVolume(
            volumeId,
            { type: "image" },
          );
        } else {
          volume = await cornerstone.volumeLoader.createAndCacheVolume(
            volumeId,
            { imageIds: files },
          );
        }
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

      // Reset cameras
      const renderingEngine = renderingEngineRef.current;
      renderingEngine.getViewports().forEach((viewport) => {
        viewport.resetCamera(true, true, true, true);
        viewport.render();
      });

      // Reset Window Level
      if (context.leftClickToolWindowLevelVisible) {
        // reset window level tool (https://github.com/cornerstonejs/cornerstone3D/blob/089ac3e50d40067ff93e73a4c0e6bbf6594a6c98/packages/tools/src/tools/WindowLevelTool.ts)
        const viewportId = "dicom_stack";
        const viewport = renderingEngine.getViewport(viewportId);

        // Access the currently displayed image
        const imageId = viewport.getCurrentImageId();
        const image = cornerstone.cache.getImage(imageId);

        // Reset window level to default (from image metadata)
        viewport.setProperties({
          voiRange: cornerstone.utilities.windowLevel.toLowHighRange(
            image.windowWidth,
            image.windowCenter,
          ),
        });
      }

      // Remove active segmentation
      if (context.leftClickToolRectangleScissorsVisible) {
        const toolGroupId = "stack_tool_group";
        const segmentationIds = cornerstoneTools.segmentation.state
          .getSegmentations()
          .map((seg) => seg.segmentationId);

        if (segmentationIds.length) {
          // Get active segmentation
          const activeSegmentation =
            cornerstoneTools.segmentation.activeSegmentation.getActiveSegmentation(
              toolGroupId,
            );
          const activeSegmentationRepresentation =
            cornerstoneTools.segmentation.activeSegmentation.getActiveSegmentationRepresentation(
              toolGroupId,
            );

          if (activeSegmentation && activeSegmentationRepresentation) {
            // Remove the segmentation from the tool group
            cornerstoneTools.segmentation.removeSegmentationsFromToolGroup(
              toolGroupId,
              [activeSegmentationRepresentation.segmentationRepresentationUID],
            );

            // Remove the segmentation from the state
            cornerstoneTools.segmentation.state.removeSegmentation(
              activeSegmentation.segmentationId,
            );

            // Remove cached images associated with the segmentation
            const labelmap =
              activeSegmentation.representationData[
                cornerstoneTools.Enums.SegmentationRepresentations.Labelmap
              ];

            if (labelmap.imageIdReferenceMap) {
              labelmap.imageIdReferenceMap.forEach((derivedImagesId) => {
                cornerstone.cache.removeImageLoadObject(derivedImagesId);
              });
            }

            // Create a new segmentation
            async function createSegmentation() {
              const group = getOrCreateToolgroup(toolGroupId);
              // cornerstoneTools.addTool(cornerstoneTools.SegmentationDisplayTool);

              // group.addTool(cornerstoneTools.SegmentationDisplayTool.toolName);
              group.setToolActive(
                cornerstoneTools.SegmentationDisplayTool.toolName,
              );

              // Get the current imageId from the viewport
              const viewportId = "dicom_stack";
              const viewport = renderingEngine.getViewport(viewportId);
              const currentImageId = viewport.getCurrentImageId();

              // Create a derived segmentation image for the current image
              const { imageId: newSegImageId } =
                await cornerstone.imageLoader.createAndCacheDerivedSegmentationImage(
                  currentImageId,
                );

              // Create a unique segmentationId
              //const segmentationId = `SEGMENTATION_${newSegImageId}`;

              // Add the segmentation to the segmentation state
              cornerstoneTools.segmentation.addSegmentations([
                {
                  segmentationId: segId,
                  representation: {
                    type: cornerstoneTools.Enums.SegmentationRepresentations
                      .Labelmap,
                    data: {
                      imageIdReferenceMap: new Map([
                        [currentImageId, newSegImageId],
                      ]),
                    },
                  },
                },
              ]);

              // Add the segmentation representation to the tool group
              const [uid] =
                await cornerstoneTools.segmentation.addSegmentationRepresentations(
                  toolGroupId,
                  [
                    {
                      segmentationId: segId,
                      type: cornerstoneTools.Enums.SegmentationRepresentations
                        .Labelmap,
                    },
                  ],
                );

              // Set the active segmentation representation
              cornerstoneTools.segmentation.activeSegmentation.setActiveSegmentationRepresentation(
                toolGroupId,
                uid,
              );

              // RectangleScissorsTool
              if (context.leftClickToolGroupValue === "selection") {
                group.setToolActive(
                  cornerstoneTools.RectangleScissorsTool.toolName,
                  {
                    bindings: [
                      {
                        mouseButton:
                          cornerstoneTools.Enums.MouseBindings.Primary,
                      },
                    ],
                  },
                );

                console.log("selection activated");
              }
            }
            createSegmentation();
          }
        }
      }

      ////Remove active segmentation
      //if (context.leftClickToolRectangleScissorsVisible) {
      //    // Remove all segmentations

      //    const segmentationIds = cornerstoneTools.segmentation.state.getSegmentations().map(seg => seg.segmentationId);
      //    console.log("segmentationIds is", segmentationIds);

      //    const segVolume = cornerstone.cache.getVolume(segId);
      //    console.log("segVolume is", segVolume);

      //    const scalarData = segVolume.scalarData;
      //    console.log("scalarData is", scalarData);

      //    scalarData.fill(0);
      //    // redraw segmentation
      //    cornerstoneTools.segmentation
      //        .triggerSegmentationEvents
      //        .triggerSegmentationDataModified(segId);
      //}
    }
    context.setResetViewportsValue(false);
  }, [context.resetViewportsValue]);

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
    const maskForm = context.formToolGroupValue;
    const maskFunction = context.functionToolGroupValue;
    const spacing = null
    await submitFinalCoords(coords, spacing, iec, maskForm, maskFunction);
  }
  async function handleMarkAccepted() {
    await flagAsAccepted(iec);
    alert("Marked as accepted!");
  }
  async function handleMarkRejected() {
    await flagAsRejected(iec);
    alert("Marked as rejected!");
  }
  async function handleMarkSkipped() {
    await flagAsSkipped(iec);
    alert("Marked as skipped!");
  }
  async function handleMarkNonmaskable() {
    await flagAsNonmaskable(iec);
    alert("Marked as Non-Maskable!");
  }
  async function handleMarkGood() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Good");
    } else {
      await setDicomStatus(iec, "Good");
    }
    alert("Marked as Good!");
  }
  async function handleMarkBad() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Bad");
    } else {
      await setDicomStatus(iec, "Bad");
    }
    alert("Marked as Bad!");
  }
  async function handleMarkBlank() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Blank");
    } else {
      await setDicomStatus(iec, "Blank");
    }
    alert("Marked as Blank!");
  }
  async function handleMarkScout() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Scout");
    } else {
      await setDicomStatus(iec, "Scout");
    }
    alert("Marked as Scout!");
  }
  async function handleMarkOther() {
    if (context.nifti) {
      await setNiftiStatus(files[0], "Other");
    } else {
      await setDicomStatus(iec, "Other");
    }
    alert("Marked as Other!");
  }
  async function handleMarkFlag() {
    if (context.nifti) {
      await setMaskingFlag(files[0]);
    } else {
      await setMaskingFlag(iec);
    }
    alert("Flagged for Masking");
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

export default ViewStackPanel;
