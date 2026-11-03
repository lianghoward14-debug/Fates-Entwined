// Keep the /tutorial entry points, using the original video tutorial.
(function(){
  'use strict';
  window.openTutorialCourse=function(){window.startTutorial();};
  if(/^\/tutorial\/?$/.test(location.pathname)){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',window.openTutorialCourse,{once:true});
    else window.openTutorialCourse();
  }
})();
