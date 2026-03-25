package handlers
import (
	"net/http"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

func ListObjects(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projects, err := repo.List(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, projects)
	}
}

func CreateObject(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var p models.ProjectObject
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := repo.Create(c.Request.Context(), &p); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, p)
	}
}

func GetObject(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var project models.ProjectObject
		if err := repo.DB.First(&project, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, project)
	}
}
