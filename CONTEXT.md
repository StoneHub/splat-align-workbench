# Splat alignment

This context names the user-facing concepts for aligning two Gaussian splats by corresponding real-world landmarks.

## Language

**Target splat**:
The splat whose coordinate system defines the alignment result.
_Avoid_: Reference splat, fixed splat

**Source splat**:
The splat transformed into the Target splat's coordinate system.
_Avoid_: Moving splat, secondary splat

**Landmark pair**:
A point on the Target splat and its matching real-world point on the Source splat.
_Avoid_: Control point, tie point

**Alignment**:
The Source splat's scale, rotation, and translation relative to the Target splat, estimated from Landmark pairs.
_Avoid_: Registration, pose

**Overlay preview**:
A view of the Target splat and transformed Source splat together before export.
_Avoid_: Merge preview

**Merged PLY**:
The primary exported splat containing the Target splat and aligned Source splat.
_Avoid_: Combined scene

**Alignment session**:
A portable record of the alignment inputs, Landmark pairs, result, and relevant measurements without the splat files themselves.
_Avoid_: Project file, workspace

**Virtual correspondence**:
A Landmark pair presented with a task-specific meaning while still contributing two corresponding points to the Alignment.
_Avoid_: Constraint

**Experimental Stitch**:
An alignment mode that uses Virtual correspondences labeled for seam, direction, and plane guidance. It does not impose geometric direction or plane constraints.
_Avoid_: Stitch solver, geometric Stitch
