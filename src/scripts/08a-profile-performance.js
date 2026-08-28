// Keep built-in portraits as lightweight asset references instead of embedding
// a freshly encoded PNG in every profile, leaderboard, and sync payload.
(function(){
  'use strict';
  const legacySaveCroppedImage = window.saveCroppedImage;
  const legacyOpenProfileImageEditor = window.openProfileImageEditor;
  const legacyOpenImageCropper = window.openImageCropper;
  const legacyRenderProfileModal = window.renderProfileModal;

  function setPortraitToolOpen(open){
    document.body?.classList.toggle('profile-portrait-tool-open', !!open);
  }

  if(typeof legacyOpenProfileImageEditor === 'function'){
    window.openProfileImageEditor = function optimizedProfileImageEditor(){
      setPortraitToolOpen(true);
      return legacyOpenProfileImageEditor.apply(this, arguments);
    };
  }
  if(typeof legacyOpenImageCropper === 'function'){
    window.openImageCropper = function optimizedProfileImageCropper(){
      setPortraitToolOpen(true);
      return legacyOpenImageCropper.apply(this, arguments);
    };
  }
  if(typeof legacyRenderProfileModal === 'function'){
    window.renderProfileModal = function restoreTitleAfterPortraitTool(){
      setPortraitToolOpen(false);
      return legacyRenderProfileModal.apply(this, arguments);
    };
  }

  const modal = document.getElementById('modal');
  if(modal && 'MutationObserver' in window){
    new MutationObserver(()=>{
      const portraitToolVisible = !!modal.querySelector('#pfp-picker-grid,#cropper-area');
      if(!modal.classList.contains('on') || !portraitToolVisible) setPortraitToolOpen(false);
    }).observe(modal, {attributes:true, attributeFilter:['class'], childList:true, subtree:true});
  }

  window.saveCroppedImage = function saveCroppedImageFast(card){
    if(!card || !card.pfpId){
      return typeof legacySaveCroppedImage === 'function'
        ? legacySaveCroppedImage(card)
        : undefined;
    }

    const img = document.getElementById('cropper-img');
    const state = typeof _cropState !== 'undefined' ? _cropState : null;
    if(!img || !state) return;

    if(typeof clampCropperOffsets === 'function') clampCropperOffsets();
    const cropBox = typeof getCropBoxMetrics === 'function'
      ? getCropBoxMetrics()
      : {x:18, y:18, w:264, h:264};
    const scale = Math.max(0.0001, (state.baseScale || 1) * (state.zoom || 1));
    const sx = Math.max(0, (cropBox.x - state.offsetX) / scale);
    const sy = Math.max(0, (cropBox.y - state.offsetY) / scale);
    const sw = Math.min(img.naturalWidth - sx, cropBox.w / scale);
    const sh = Math.min(img.naturalHeight - sy, cropBox.h / scale);
    const focusX = img.naturalWidth ? (sx + sw / 2) / img.naturalWidth : 0.5;
    const focusY = img.naturalHeight ? (sy + sh / 2) / img.naturalHeight : 0.5;

    USER_PROFILE.profileImg = {
      pfpId:Number(card.pfpId),
      cropZoom:state.zoom || 1,
      cropFocusX:Math.max(0, Math.min(1, focusX)),
      cropFocusY:Math.max(0, Math.min(1, focusY))
    };

    document.onmousemove = null;
    document.onmouseup = null;
    saveProfile();
    if(typeof refreshProfileDisplays === 'function') refreshProfileDisplays();
    if(typeof toast === 'function') toast('Profile picture saved');
    if(typeof renderProfileModal === 'function') renderProfileModal(false);
  };
})();
